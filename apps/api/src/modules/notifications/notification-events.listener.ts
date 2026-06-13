import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OwnerNotificationService } from './owner-notification.service';
import { Cron } from '@nestjs/schedule';

/**
 * Listens to business events and triggers owner notifications.
 * This service bridges domain events to the notification system.
 *
 * In the future, this could use NestJS EventEmitter or a proper event bus.
 * For now, services call these methods directly after key operations.
 */
@Injectable()
export class NotificationEventsListener {
  private readonly logger = new Logger(NotificationEventsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: OwnerNotificationService,
  ) {}

  /**
   * Called by OrdersService after creating a new order.
   */
  async handleOrderCreated(
    tenantId: string,
    schemaName: string,
    order: { orderNumber: string; customerId: string; total: number; items: any[]; channelType: string },
  ): Promise<void> {
    // Get customer name
    const customers = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT name FROM "${schemaName}".customers WHERE id = $1::uuid`, order.customerId,
    );

    await this.notifications.onNewOrder({
      tenantId,
      schemaName,
      orderNumber: order.orderNumber,
      customerName: customers[0]?.name ?? 'Cliente',
      total: order.total,
      itemCount: Array.isArray(order.items) ? order.items.length : 0,
      channel: order.channelType,
    });
  }

  /**
   * Called by PaymentVerificationService after verifying a payment.
   */
  async handlePaymentVerified(
    tenantId: string,
    schemaName: string,
    payment: { orderNumber: string; amount: number; method: string; customerId: string },
  ): Promise<void> {
    const customers = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT name FROM "${schemaName}".customers WHERE id = $1::uuid`, payment.customerId,
    );

    await this.notifications.onPaymentVerified({
      tenantId,
      schemaName,
      orderNumber: payment.orderNumber,
      amount: payment.amount,
      method: payment.method,
      customerName: customers[0]?.name ?? 'Cliente',
    });
  }

  /**
   * Called by ShipmentService when a delivery is confirmed.
   */
  async handleShipmentDelivered(
    tenantId: string,
    schemaName: string,
    shipment: { orderNumber: string; customerId: string; carrier: string },
  ): Promise<void> {
    const customers = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT name FROM "${schemaName}".customers WHERE id = $1::uuid`, shipment.customerId,
    );

    await this.notifications.onShipmentDelivered({
      tenantId,
      schemaName,
      orderNumber: shipment.orderNumber,
      customerName: customers[0]?.name ?? 'Cliente',
      carrier: shipment.carrier,
    });
  }

  /**
   * Daily summary — runs at 8:00 PM every day.
   * Sends the owner a recap of the day's activity.
   */
  @Cron('0 20 * * *', { name: 'daily-owner-summary' })
  async sendDailySummaries(): Promise<void> {
    this.logger.log('📊 Sending daily summaries to owners...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, schemaName: true, slug: true },
    });

    for (const tenant of tenants) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

        // Get today's stats
        const stats = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT
            COUNT(*) FILTER (WHERE created_at >= $1::date) AS orders_today,
            COALESCE(SUM(total) FILTER (WHERE created_at >= $1::date AND status != 'cancelled'), 0) AS revenue,
            COUNT(*) FILTER (WHERE status = 'payment_pending') AS pending_payments,
            COUNT(*) FILTER (WHERE status IN ('ready', 'paid')) AS pending_shipments
          FROM "${tenant.schemaName}".orders
        `, today);

        const s = stats[0] ?? {};
        const ordersToday = parseInt(s.orders_today ?? '0');

        // Only send if there was activity
        if (ordersToday > 0) {
          await this.notifications.onDailySummary({
            tenantId: tenant.id,
            schemaName: tenant.schemaName,
            ordersToday,
            revenueToday: parseFloat(s.revenue ?? '0'),
            pendingPayments: parseInt(s.pending_payments ?? '0'),
            pendingShipments: parseInt(s.pending_shipments ?? '0'),
          });
        }
      } catch (err: any) {
        this.logger.error(`Daily summary failed for ${tenant.slug}: ${err.message}`);
      }
    }
  }
}
