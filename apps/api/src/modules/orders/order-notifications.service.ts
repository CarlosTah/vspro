import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MessagingFactory } from '../messaging/messaging-factory.service';
import { OrderStatus } from '@vspro/shared';

/**
 * Order Notifications Service — Sends automatic WhatsApp/Messenger/Instagram
 * notifications to the customer when their order status changes.
 *
 * Triggered by: OrdersService.transition() → this.notify()
 *
 * Messages sent:
 * - payment_verified: "✅ Pago confirmado, tu pedido está en preparación"
 * - in_production:    "👨‍🍳 Tu pedido se está preparando"
 * - ready:            "🎉 ¡Tu pedido está listo! Pasa a recoger / Tu repartidor va en camino"
 * - shipped:          "🛵 Tu pedido va en camino"
 * - delivered:        "✅ Entregado. ¡Gracias por tu compra!"
 * - cancelled:        "❌ Tu pedido fue cancelado"
 *
 * Respects Meta 24h window: falls back to template if outside window.
 */
@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingFactory: MessagingFactory,
  ) {}

  /**
   * Send notification to customer when order status changes.
   * Non-blocking: errors are logged but don't break the transition.
   */
  async notify(
    orderId: string,
    newStatus: OrderStatus,
    schemaName: string,
  ): Promise<void> {
    try {
      // Get order + customer info
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT o.order_number AS "orderNumber",
               o.total,
               o.items,
               o.channel_type AS "channelType",
               o.shipping_address AS "shippingAddress",
               c.id AS "customerId",
               c.name AS "customerName",
               c.channel_id AS "channelId",
               c.channel_type AS "customerChannelType"
        FROM "${schemaName}".orders o
        JOIN "${schemaName}".customers c ON c.id = o.customer_id
        WHERE o.id = $1::uuid
      `, orderId);

      if (!rows[0]) return;

      const order = rows[0];
      const message = this.buildMessage(newStatus, order);

      if (!message) return; // No notification for this status

      // Determine channel (use the customer's original channel)
      const channelType = order.customerChannelType ?? order.channelType;
      const recipientId = order.channelId;

      if (!recipientId) {
        this.logger.debug(`No channelId for customer ${order.customerId}, skipping notification`);
        return;
      }

      // Check if within 24h messaging window
      const withinWindow = await this.isWithinWindow(order.customerId, schemaName);

      if (withinWindow) {
        // Send free-form message
        const result = await this.messagingFactory.sendText(
          recipientId,
          message,
          channelType,
          schemaName,
        );

        if (result.success) {
          this.logger.log(`[${schemaName}] Notification sent: ${order.orderNumber} → ${newStatus}`);
          await this.recordMessage(order.customerId, message, schemaName);
        } else {
          this.logger.warn(`[${schemaName}] Notification failed: ${result.error}`);
        }
      } else {
        // Outside 24h window — use template
        const templateName = this.getTemplateName(newStatus);
        if (templateName) {
          const result = await this.messagingFactory.sendTemplate(
            recipientId,
            templateName,
            'es',
            channelType,
            schemaName,
            [{ type: 'body', parameters: [{ type: 'text', text: order.orderNumber }] }],
          );

          if (result.success) {
            this.logger.log(`[${schemaName}] Template notification sent: ${order.orderNumber} → ${newStatus}`);
          }
        } else {
          this.logger.debug(`[${schemaName}] Outside 24h window, no template for ${newStatus}`);
        }
      }
    } catch (err: any) {
      // Non-blocking: log and continue
      this.logger.error(`Notification error for order ${orderId}: ${err.message}`);
    }
  }

  // ─── Message Templates ────────────────────────────────────────

  private buildMessage(status: OrderStatus, order: any): string | null {
    const name = order.customerName?.split(' ')[0] ?? '';
    const num = order.orderNumber;
    const total = parseFloat(order.total ?? 0).toLocaleString();
    const hasDelivery = !!order.shippingAddress;

    switch (status) {
      case 'payment_verified':
        return `✅ *Pago confirmado*\n\n${name}, recibimos tu pago de $${total} para el pedido *${num}*.\n\nTu pedido ya está en preparación. 👨‍🍳`;

      case 'in_production':
        return `👨‍🍳 *En preparación*\n\n${name}, tu pedido *${num}* se está preparando.\n\nTe avisamos cuando esté listo.`;

      case 'ready':
        if (hasDelivery) {
          return `🎉 *¡Pedido listo!*\n\n${name}, tu pedido *${num}* está listo.\n\n🛵 Tu repartidor va en camino. Te avisamos cuando salga.`;
        }
        return `🎉 *¡Pedido listo!*\n\n${name}, tu pedido *${num}* está listo para recoger.\n\n📍 Pasa cuando gustes. ¡Te esperamos!`;

      case 'shipped':
        return `🛵 *En camino*\n\n${name}, tu pedido *${num}* ya va en camino.\n\n⏱ Llegará en aproximadamente 20-30 minutos.`;

      case 'delivered':
        return `✅ *Entregado*\n\n${name}, tu pedido *${num}* fue entregado.\n\n¡Gracias por tu compra! 🙏 Que lo disfrutes.`;

      case 'cancelled':
        return `❌ *Pedido cancelado*\n\n${name}, tu pedido *${num}* fue cancelado.\n\nSi necesitas ayuda, escríbenos.`;

      default:
        return null; // No notification for other states
    }
  }

  private getTemplateName(status: OrderStatus): string | null {
    // These template names should be pre-approved in Meta Business Manager
    switch (status) {
      case 'payment_verified': return 'order_payment_confirmed';
      case 'ready': return 'order_ready';
      case 'shipped': return 'order_shipped';
      case 'delivered': return 'order_delivered';
      default: return null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async isWithinWindow(customerId: string, schemaName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT m.created_at
      FROM "${schemaName}".messages m
      JOIN "${schemaName}".conversations c ON c.id = m.conversation_id
      WHERE c.customer_id = $1::uuid AND m.direction = 'inbound'
      ORDER BY m.created_at DESC LIMIT 1
    `, customerId);

    if (!rows[0]) return false;

    const lastInbound = new Date(rows[0].created_at);
    const hoursSince = (Date.now() - lastInbound.getTime()) / 3600000;
    return hoursSince <= 24;
  }

  private async recordMessage(customerId: string, content: string, schemaName: string): Promise<void> {
    // Find most recent conversation for this customer
    const convs = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id FROM "${schemaName}".conversations
      WHERE customer_id = $1::uuid ORDER BY created_at DESC LIMIT 1
    `, customerId);

    if (convs[0]) {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".messages
          (conversation_id, direction, type, content, ai_processed)
        VALUES ($1::uuid, 'outbound', 'text', $2, false)
      `, convs[0].id, content);
    }
  }
}
