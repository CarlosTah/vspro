import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { MessagingFactory } from '../messaging/messaging-factory.service';

/**
 * Delivery Dispatch Automation:
 * 1. Auto-dispatch: Every minute, check orders with status='ready' that haven't been dispatched yet
 * 2. Timeout: Every 5 min, check offered assignments past timeout and reasign
 */
@Injectable()
export class DeliveryDispatchCronService {
  private readonly logger = new Logger(DeliveryDispatchCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingFactory: MessagingFactory,
  ) {}

  /**
   * Auto-dispatch: Every minute, find orders marked as 'ready' with shipping address
   * that have no delivery assignment yet, and dispatch to an available driver.
   */
  @Cron('*/60 * * * * *') // every 60 seconds
  async autoDispatchReady(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, slug: true, schemaName: true, businessName: true },
    });

    for (const tenant of tenants) {
      try {
        const settings = await this.getDeliverySettings(tenant.schemaName);
        if (!settings.autoDispatchEnabled) continue;

        // Find ready orders without delivery assignment
        const readyOrders = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT o.id, o.order_number AS "orderNumber", o.total, o.shipping_address AS "shippingAddress",
                 c.name AS "customerName", c.channel_id AS "customerChannelId"
          FROM "${tenant.schemaName}".orders o
          JOIN "${tenant.schemaName}".customers c ON c.id = o.customer_id
          WHERE o.status = 'ready'
            AND o.shipping_address IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM "${tenant.schemaName}".delivery_assignments da
              WHERE da.order_id = o.id AND da.status IN ('offered', 'accepted', 'picked_up')
            )
        `);

        for (const order of readyOrders) {
          await this.dispatchToDriver(tenant.schemaName, order, settings);
        }
      } catch (err: any) {
        // Silently skip tenants without delivery_assignments table
        if (!err.message?.includes('does not exist')) {
          this.logger.error(`Auto-dispatch error for ${tenant.slug}: ${err.message}`);
        }
      }
    }
  }

  /**
   * Timeout check: Every 5 minutes, check offered assignments past timeout and reasign.
   */
  @Cron('*/5 * * * *') // every 5 minutes
  async checkTimeouts(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, slug: true, schemaName: true },
    });

    for (const tenant of tenants) {
      try {
        const settings = await this.getDeliverySettings(tenant.schemaName);
        if (!settings.autoDispatchEnabled) continue;

        // Find offered assignments past timeout
        const expired = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT da.id, da.order_id AS "orderId", da.driver_id AS "driverId",
                 o.order_number AS "orderNumber", o.total, o.shipping_address AS "shippingAddress",
                 c.name AS "customerName", c.channel_id AS "customerChannelId",
                 (SELECT COUNT(*) FROM "${tenant.schemaName}".delivery_assignments
                  WHERE order_id = da.order_id AND status = 'rejected') AS "rejectCount"
          FROM "${tenant.schemaName}".delivery_assignments da
          JOIN "${tenant.schemaName}".orders o ON o.id = da.order_id
          JOIN "${tenant.schemaName}".customers c ON c.id = o.customer_id
          WHERE da.status = 'offered'
            AND da.offered_at < NOW() - INTERVAL '${settings.timeoutMinutes} minutes'
        `);

        for (const assignment of expired) {
          const rejectCount = parseInt(assignment.rejectCount) || 0;

          // Mark as rejected (timeout)
          await this.prisma.$executeRawUnsafe(`
            UPDATE "${tenant.schemaName}".delivery_assignments
            SET status = 'rejected' WHERE id = $1::uuid
          `, assignment.id);

          // If under max retries, try next driver
          if (rejectCount + 1 < settings.maxRetries) {
            this.logger.log(`[${tenant.slug}] Timeout on ${assignment.orderNumber}, trying next driver`);
            await this.dispatchToDriver(tenant.schemaName, {
              id: assignment.orderId,
              orderNumber: assignment.orderNumber,
              total: assignment.total,
              shippingAddress: assignment.shippingAddress,
              customerName: assignment.customerName,
              customerChannelId: assignment.customerChannelId,
            }, settings, assignment.driverId);
          } else {
            // Max retries reached — notify admin
            this.logger.warn(`[${tenant.slug}] Max retries reached for ${assignment.orderNumber}. No drivers available.`);
          }
        }
      } catch (err: any) {
        if (!err.message?.includes('does not exist')) {
          this.logger.error(`Timeout check error for ${tenant.slug}: ${err.message}`);
        }
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async dispatchToDriver(
    schemaName: string,
    order: any,
    settings: any,
    excludeDriverId?: string,
  ): Promise<void> {
    // Find available driver (exclude the one that timed out)
    const excludeClause = excludeDriverId ? `AND d.id != '${excludeDriverId}'::uuid` : '';
    const drivers = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT d.id, d.name, d.phone
      FROM "${schemaName}".delivery_drivers d
      WHERE d.status = 'available' ${excludeClause}
        AND (SELECT COUNT(*) FROM "${schemaName}".delivery_assignments a
             WHERE a.driver_id = d.id AND a.status IN ('accepted', 'picked_up')) < d.max_deliveries
      ORDER BY (SELECT COUNT(*) FROM "${schemaName}".delivery_assignments a
                WHERE a.driver_id = d.id AND a.status IN ('accepted', 'picked_up')) ASC
      LIMIT 1
    `);

    if (drivers.length === 0) {
      this.logger.debug(`[${schemaName}] No available drivers for order ${order.orderNumber}`);
      return;
    }

    const driver = drivers[0];

    // Create assignment
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".delivery_assignments (order_id, driver_id, status, offered_at)
      VALUES ($1::uuid, $2::uuid, 'offered', NOW())
    `, order.id, driver.id);

    // Build message from template
    const address = typeof order.shippingAddress === 'object'
      ? `${order.shippingAddress.street ?? ''} ${order.shippingAddress.colony ?? ''} ${order.shippingAddress.city ?? ''}`.trim()
      : (order.shippingAddress ?? 'No especificada');

    const reference = (typeof order.shippingAddress === 'object' && order.shippingAddress?.reference)
      ? `\n📝 Ref: ${order.shippingAddress.reference}`
      : '';

    // Append Google Maps link if coordinates available
    const mapsLink = (typeof order.shippingAddress === 'object' && order.shippingAddress?.lat && order.shippingAddress?.lng)
      ? `\n🗺️ https://maps.google.com/?q=${order.shippingAddress.lat},${order.shippingAddress.lng}`
      : (typeof order.shippingAddress === 'object' && order.shippingAddress?.mapsUrl)
        ? `\n🗺️ ${order.shippingAddress.mapsUrl}`
        : '';

    const message = (settings.dispatchMessage || '📦 Pedido #{orderNumber} listo.\n👤 Cliente: {customerName}\n📍 {address}\n💰 Total: ${total}\n\n¿Puedes recogerlo? Responde SI o NO')
      .replace('{orderNumber}', order.orderNumber)
      .replace('{address}', address + reference + mapsLink)
      .replace('{total}', parseFloat(order.total).toLocaleString('es-MX'))
      .replace('{customerName}', order.customerName ?? 'Cliente');

    // Send WhatsApp to driver
    const result = await this.messagingFactory.sendText(driver.phone, message, 'whatsapp', schemaName);
    if (result.success) {
      this.logger.log(`[${schemaName}] Dispatched ${order.orderNumber} to ${driver.name}`);
    } else {
      this.logger.warn(`[${schemaName}] Failed to send to ${driver.name}: ${result.error}`);
    }
  }

  private async getDeliverySettings(schemaName: string): Promise<any> {
    const defaults = {
      autoDispatchEnabled: true,
      timeoutMinutes: 5,
      maxRetries: 3,
      dispatchMessage: '',
      notifyClientOnShipped: true,
      notifyClientOnDelivered: true,
    };

    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT agent_config->'deliverySettings' AS settings
        FROM "${schemaName}".ai_config LIMIT 1
      `);
      return { ...defaults, ...(rows[0]?.settings ?? {}) };
    } catch {
      return defaults;
    }
  }
}
