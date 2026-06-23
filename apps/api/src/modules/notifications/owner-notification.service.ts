import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MessagingFactory } from '../messaging/messaging-factory.service';

export interface OwnerNotificationPayload {
  schemaName: string;
  type: 'complaint' | 'ticket' | 'cancellation' | 'general';
  title: string;
  body: string;
  customerName?: string;
  customerPhone?: string;
  orderId?: string;
  orderNumber?: string;
  conversationId?: string;
  priority?: 'low' | 'medium' | 'high';
}

/**
 * Reusable service to notify tenant owners via WhatsApp.
 * Used by: complaint escalation, support tickets, order cancellations, etc.
 */
@Injectable()
export class OwnerNotificationService {
  private readonly logger = new Logger(OwnerNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingFactory,
  ) {}

  /**
   * Send a WhatsApp notification to the tenant owner(s) with admin role.
   * Looks up phone from the tenant's users table.
   */
  async notifyOwner(payload: OwnerNotificationPayload): Promise<{ sent: boolean; error?: string }> {
    try {
      // Get admin users with phone numbers
      const admins = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT name, phone, email FROM "${payload.schemaName}".users
        WHERE role IN ('admin', 'manager') AND phone IS NOT NULL
        ORDER BY role ASC
        LIMIT 3
      `);

      if (!admins || admins.length === 0) {
        this.logger.debug(`No admins with phone found in ${payload.schemaName}`);
        return { sent: false, error: 'No admin phone found' };
      }

      // Build notification message
      const message = this.buildMessage(payload);

      // Send to all admin/manager phones
      let sentCount = 0;
      for (const admin of admins) {
        const result = await this.messaging.sendText(
          admin.phone,
          message,
          'whatsapp',
          payload.schemaName,
        );
        if (result.success) sentCount++;
      }

      if (sentCount > 0) {
        this.logger.log(`[${payload.schemaName}] Owner notified: ${payload.type} — ${payload.title}`);
        return { sent: true };
      }

      return { sent: false, error: 'Failed to send to any admin' };
    } catch (err: any) {
      this.logger.error(`Owner notification failed: ${err.message}`);
      return { sent: false, error: err.message };
    }
  }

  // ─── Event-driven notifications ────────────────────────────────

  async onNewOrder(data: { tenantId: string; schemaName: string; orderNumber: string; customerName: string; total: number; itemCount: number; channel: string }) {
    return this.notifyOwner({
      schemaName: data.schemaName,
      type: 'general',
      title: `Nuevo pedido #${data.orderNumber}`,
      body: `${data.customerName} hizo un pedido de $${data.total.toLocaleString('es-MX')} (${data.itemCount} productos) por ${data.channel}.`,
      customerName: data.customerName,
      orderNumber: data.orderNumber,
    });
  }

  async onPaymentVerified(data: { tenantId: string; schemaName: string; orderNumber: string; amount: number; method: string; customerName: string }) {
    return this.notifyOwner({
      schemaName: data.schemaName,
      type: 'general',
      title: `Pago verificado #${data.orderNumber}`,
      body: `${data.customerName} pagó $${data.amount.toLocaleString('es-MX')} por ${data.method}.`,
      customerName: data.customerName,
      orderNumber: data.orderNumber,
    });
  }

  async onShipmentDelivered(data: { tenantId: string; schemaName: string; orderNumber: string; customerName: string; carrier: string }) {
    return this.notifyOwner({
      schemaName: data.schemaName,
      type: 'general',
      title: `Entrega confirmada #${data.orderNumber}`,
      body: `Pedido de ${data.customerName} entregado exitosamente vía ${data.carrier}.`,
      customerName: data.customerName,
      orderNumber: data.orderNumber,
    });
  }

  async onDailySummary(data: { tenantId: string; schemaName: string; ordersToday: number; revenueToday: number; pendingPayments: number; pendingShipments: number }) {
    const body = `📦 Pedidos hoy: ${data.ordersToday}\n💰 Revenue: $${data.revenueToday.toLocaleString('es-MX')}\n⏳ Pagos pendientes: ${data.pendingPayments}\n🚚 Envíos pendientes: ${data.pendingShipments}`;
    return this.notifyOwner({
      schemaName: data.schemaName,
      type: 'general',
      title: 'Resumen del día',
      body,
    });
  }

  private buildMessage(payload: OwnerNotificationPayload): string {
    const icons: Record<string, string> = {
      complaint: '⚠️',
      ticket: '🎫',
      cancellation: '❌',
      general: '📢',
    };

    const priorityLabels: Record<string, string> = {
      high: '🔴 URGENTE',
      medium: '🟡 Media',
      low: '🟢 Baja',
    };

    let msg = `${icons[payload.type]} *${payload.title}*\n\n`;
    msg += payload.body;

    if (payload.customerName) {
      msg += `\n\n👤 Cliente: ${payload.customerName}`;
    }
    if (payload.customerPhone) {
      msg += `\n📱 Tel: ${payload.customerPhone}`;
    }
    if (payload.orderNumber) {
      msg += `\n📦 Pedido: #${payload.orderNumber}`;
    }
    if (payload.priority) {
      msg += `\n⚡ Prioridad: ${priorityLabels[payload.priority] ?? payload.priority}`;
    }

    msg += `\n\n💡 Entra al panel para dar seguimiento → https://app.vspro.app`;

    return msg;
  }
}
