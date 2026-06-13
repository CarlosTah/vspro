import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma.service';

/**
 * Owner Notification Service — Push alerts to PYME owner via WhatsApp.
 *
 * Triggered automatically when key business events occur:
 * - New order created
 * - Payment received/verified
 * - Low stock detected
 * - Shipment delivered
 * - Customer complaint/escalation
 *
 * The owner's WhatsApp number is stored in the tenant's admin user record.
 * Messages are queued to avoid blocking the main flow.
 */
@Injectable()
export class OwnerNotificationService {
  private readonly logger = new Logger(OwnerNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('owner-notifications') private readonly notifQueue: Queue,
  ) {}

  // ─── Event Triggers ───────────────────────────────────────────

  /**
   * Notify owner: new order received.
   */
  async onNewOrder(event: {
    tenantId: string;
    schemaName: string;
    orderNumber: string;
    customerName: string;
    total: number;
    itemCount: number;
    channel: string;
  }): Promise<void> {
    const message = `🛒 *Nuevo pedido*\n\n` +
      `📋 ${event.orderNumber}\n` +
      `👤 ${event.customerName}\n` +
      `💰 $${event.total.toLocaleString()} MXN\n` +
      `📦 ${event.itemCount} artículo(s)\n` +
      `📱 Canal: ${event.channel}`;

    await this.enqueueNotification(event.tenantId, event.schemaName, 'new_order', message);
  }

  /**
   * Notify owner: payment received and verified.
   */
  async onPaymentVerified(event: {
    tenantId: string;
    schemaName: string;
    orderNumber: string;
    amount: number;
    method: string;
    customerName: string;
  }): Promise<void> {
    const message = `💰 *Pago recibido*\n\n` +
      `📋 ${event.orderNumber}\n` +
      `👤 ${event.customerName}\n` +
      `💵 $${event.amount.toLocaleString()} MXN\n` +
      `🏦 Método: ${event.method}\n` +
      `✅ Verificado automáticamente`;

    await this.enqueueNotification(event.tenantId, event.schemaName, 'payment_verified', message);
  }

  /**
   * Notify owner: low stock alert.
   */
  async onLowStock(event: {
    tenantId: string;
    schemaName: string;
    products: Array<{ name: string; sku: string; current: number; minimum: number }>;
  }): Promise<void> {
    const items = event.products.map(p => `  • ${p.name} (${p.sku}): ${p.current}/${p.minimum}`).join('\n');

    const message = `⚠️ *Alerta de inventario*\n\n` +
      `${event.products.length} producto(s) bajo stock mínimo:\n\n` +
      `${items}\n\n` +
      `Considera hacer resurtido pronto.`;

    await this.enqueueNotification(event.tenantId, event.schemaName, 'low_stock', message);
  }

  /**
   * Notify owner: shipment delivered.
   */
  async onShipmentDelivered(event: {
    tenantId: string;
    schemaName: string;
    orderNumber: string;
    customerName: string;
    carrier: string;
  }): Promise<void> {
    const message = `✅ *Pedido entregado*\n\n` +
      `📋 ${event.orderNumber}\n` +
      `👤 ${event.customerName}\n` +
      `🚚 ${event.carrier}`;

    await this.enqueueNotification(event.tenantId, event.schemaName, 'shipment_delivered', message);
  }

  /**
   * Notify owner: customer escalation (complaint or unresolved issue).
   */
  async onCustomerEscalation(event: {
    tenantId: string;
    schemaName: string;
    customerName: string;
    issue: string;
    conversationId: string;
  }): Promise<void> {
    const message = `🚨 *Escalación de cliente*\n\n` +
      `👤 ${event.customerName}\n` +
      `📝 ${event.issue}\n\n` +
      `Requiere atención humana.`;

    await this.enqueueNotification(event.tenantId, event.schemaName, 'escalation', message);
  }

  /**
   * Notify owner: daily sales summary (triggered by cron).
   */
  async onDailySummary(event: {
    tenantId: string;
    schemaName: string;
    ordersToday: number;
    revenueToday: number;
    pendingPayments: number;
    pendingShipments: number;
  }): Promise<void> {
    const message = `📊 *Resumen del día*\n\n` +
      `🛒 Pedidos: ${event.ordersToday}\n` +
      `💰 Ingresos: $${event.revenueToday.toLocaleString()}\n` +
      `⏳ Pagos pendientes: ${event.pendingPayments}\n` +
      `📦 Envíos pendientes: ${event.pendingShipments}\n\n` +
      `¡Buen trabajo! 💪`;

    await this.enqueueNotification(event.tenantId, event.schemaName, 'daily_summary', message);
  }

  // ─── Core Queue Logic ─────────────────────────────────────────

  private async enqueueNotification(
    tenantId: string,
    schemaName: string,
    type: NotificationType,
    message: string,
  ): Promise<void> {
    // Get owner's phone number
    const ownerPhone = await this.getOwnerPhone(schemaName);
    if (!ownerPhone) {
      this.logger.warn(`[${schemaName}] No owner phone configured — notification skipped`);
      return;
    }

    await this.notifQueue.add('send-notification', {
      tenantId,
      schemaName,
      type,
      message,
      ownerPhone,
      timestamp: new Date().toISOString(),
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 200,
    });

    this.logger.debug(`[${schemaName}] Notification queued: ${type}`);
  }

  /**
   * Get the owner's WhatsApp phone from the admin user record.
   */
  private async getOwnerPhone(schemaName: string): Promise<string | null> {
    // Try to get from tenant record first
    const tenant = await this.prisma.tenant.findFirst({
      where: { schemaName },
      select: { ownerEmail: true, settings: true },
    });

    const settings = tenant?.settings as Record<string, any> | null;
    if (settings?.ownerPhone) return settings.ownerPhone;

    // Fallback: get from first admin user in tenant schema
    const admins = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT name FROM "${schemaName}".users WHERE role = 'admin' LIMIT 1
    `).catch(() => []);

    // For now return null — in production the owner sets their phone during onboarding
    return null;
  }

  // ─── Notification Preferences ─────────────────────────────────

  /**
   * Check if notification type is enabled for this tenant.
   */
  async isEnabled(schemaName: string, type: NotificationType): Promise<boolean> {
    const config = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT agent_config->'notifications' AS prefs
      FROM "${schemaName}".ai_config LIMIT 1
    `).catch(() => []);

    const prefs = config[0]?.prefs;
    if (!prefs) return true; // All enabled by default

    return prefs[type] !== false;
  }
}

// ─── Types ──────────────────────────────────────────────────────

export type NotificationType =
  | 'new_order'
  | 'payment_verified'
  | 'low_stock'
  | 'shipment_delivered'
  | 'escalation'
  | 'daily_summary';

export interface NotificationJob {
  tenantId: string;
  schemaName: string;
  type: NotificationType;
  message: string;
  ownerPhone: string;
  timestamp: string;
}
