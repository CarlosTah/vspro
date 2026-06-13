import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma.service';

/**
 * Shipment Notifications Service — Proactive tracking updates to customers.
 *
 * Automatically notifies customers via their original channel (WhatsApp/Messenger/Instagram)
 * when their shipment changes status:
 *
 * - Order shipped → "Tu pedido ya va en camino 🚚"
 * - Out for delivery → "Tu pedido está por llegar 📦"
 * - Delivered → "¡Tu pedido fue entregado! ✅"
 * - Exception/delay → "Hubo un retraso en tu envío ⚠️"
 *
 * Messages are queued to avoid blocking and respect rate limits.
 */
@Injectable()
export class ShipmentNotificationsService {
  private readonly logger = new Logger(ShipmentNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('messages') private readonly messageQueue: Queue,
  ) {}

  /**
   * Notify customer when shipment status changes.
   * Called by ShipmentTrackingService.updateStatus() or carrier webhook.
   */
  async onStatusChange(event: ShipmentStatusEvent): Promise<void> {
    const { schemaName, tenantId, shipmentId, orderId, newStatus } = event;

    // Get order + customer + conversation details
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.order_number, o.customer_id,
             c.name AS customer_name, c.channel_type, c.channel_id,
             s.carrier, s.tracking_number, s.tracking_url, s.estimated_delivery,
             conv.id AS conversation_id
      FROM "${schemaName}".orders o
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      JOIN "${schemaName}".shipments s ON s.id = $1::uuid
      LEFT JOIN "${schemaName}".conversations conv
        ON conv.customer_id = o.customer_id AND conv.status = 'active'
      WHERE o.id = $2::uuid
      LIMIT 1
    `, shipmentId, orderId);

    if (!rows[0]) {
      this.logger.warn(`[${schemaName}] Cannot notify — order/customer not found for shipment ${shipmentId}`);
      return;
    }

    const data = rows[0];

    // Build the notification message
    const message = this.buildTrackingMessage(newStatus, {
      orderNumber: data.order_number,
      customerName: data.customer_name,
      carrier: data.carrier,
      trackingNumber: data.tracking_number,
      trackingUrl: data.tracking_url,
      estimatedDelivery: data.estimated_delivery,
    });

    if (!message) return; // Some statuses don't need notification

    // Store outbound message in DB
    if (data.conversation_id) {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".messages
          (conversation_id, direction, type, content, ai_processed)
        VALUES ($1::uuid, 'outbound', 'text', $2, true)
      `, data.conversation_id, message);
    }

    // Queue for delivery via MessagingFactory
    await this.messageQueue.add('send-tracking-notification', {
      tenantId,
      schemaName,
      recipientId: data.channel_id,
      channelType: data.channel_type,
      message,
      metadata: {
        type: 'shipment_tracking',
        orderId,
        shipmentId,
        status: newStatus,
      },
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    this.logger.log(`[${schemaName}] Tracking notification queued: ${data.order_number} → ${newStatus}`);
  }

  /**
   * Send tracking info when customer asks "¿dónde está mi pedido?"
   */
  async getTrackingForCustomer(
    orderId: string,
    schemaName: string,
  ): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.order_number, o.status AS order_status,
             s.carrier, s.tracking_number, s.tracking_url,
             s.status AS shipment_status, s.estimated_delivery
      FROM "${schemaName}".orders o
      LEFT JOIN "${schemaName}".shipments s ON s.order_id = o.id
      WHERE o.id = $1::uuid
      ORDER BY s.created_at DESC LIMIT 1
    `, orderId);

    if (!rows[0]) return '❌ No encontré información de ese pedido.';

    const r = rows[0];

    if (!r.tracking_number) {
      return this.getPreShipmentStatus(r.order_status, r.order_number);
    }

    return this.formatTrackingInfo(r);
  }

  /**
   * Get tracking by order number (for AI tool).
   */
  async getTrackingByOrderNumber(
    orderNumber: string,
    schemaName: string,
  ): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.id FROM "${schemaName}".orders WHERE order_number = $1
    `, orderNumber);

    if (!rows[0]) return '❌ Pedido no encontrado.';
    return this.getTrackingForCustomer(rows[0].id, schemaName);
  }

  // ─── Message Builders ─────────────────────────────────────────

  private buildTrackingMessage(
    status: string,
    data: { orderNumber: string; customerName: string; carrier: string; trackingNumber: string; trackingUrl: string | null; estimatedDelivery: string | null },
  ): string | null {
    switch (status) {
      case 'picked_up':
      case 'shipped':
        return `🚚 *¡Tu pedido va en camino!*\n\n` +
          `📋 Pedido: ${data.orderNumber}\n` +
          `📦 Paquetería: ${data.carrier}\n` +
          `🔢 Guía: ${data.trackingNumber}\n` +
          (data.estimatedDelivery ? `📅 Entrega estimada: ${this.formatDate(data.estimatedDelivery)}\n` : '') +
          (data.trackingUrl ? `\n🔗 Rastrear: ${data.trackingUrl}` : '') +
          `\n\n¡Te avisamos cuando llegue!`;

      case 'in_transit':
        return `📦 *Tu pedido sigue en camino*\n\n` +
          `📋 ${data.orderNumber}\n` +
          `🚚 ${data.carrier} — Guía: ${data.trackingNumber}\n` +
          (data.estimatedDelivery ? `📅 Llegada estimada: ${this.formatDate(data.estimatedDelivery)}` : 'En tránsito hacia tu dirección.');

      case 'out_for_delivery':
        return `🎉 *¡Tu pedido está por llegar!*\n\n` +
          `📋 ${data.orderNumber}\n` +
          `🚚 El repartidor ya va en camino a tu dirección.\n\n` +
          `Prepárate para recibirlo. 📦✨`;

      case 'delivered':
        return `✅ *¡Tu pedido fue entregado!*\n\n` +
          `📋 ${data.orderNumber}\n` +
          `📦 Entregado por ${data.carrier}\n\n` +
          `Esperamos que lo disfrutes mucho. 😊\n` +
          `Si tienes algún problema, aquí estamos para ayudarte.`;

      case 'returned':
        return `⚠️ *Aviso sobre tu pedido*\n\n` +
          `📋 ${data.orderNumber}\n` +
          `El paquete fue retornado por la paquetería.\n\n` +
          `Nos pondremos en contacto contigo para resolver esto.`;

      case 'exception':
        return `⚠️ *Aviso sobre tu envío*\n\n` +
          `📋 ${data.orderNumber}\n` +
          `Hubo un inconveniente con la entrega.\n` +
          `🚚 ${data.carrier} — Guía: ${data.trackingNumber}\n\n` +
          `Estamos dando seguimiento. Te mantendremos informado.`;

      default:
        return null; // Don't notify for internal statuses
    }
  }

  private getPreShipmentStatus(orderStatus: string, orderNumber: string): string {
    const statusMessages: Record<string, string> = {
      'new': `📋 Tu pedido ${orderNumber} fue recibido. Estamos procesándolo.`,
      'payment_pending': `📋 Tu pedido ${orderNumber} está esperando confirmación de pago. 💳`,
      'paid': `📋 Tu pedido ${orderNumber} fue pagado. Estamos preparándolo. ⏳`,
      'in_production': `🏭 Tu pedido ${orderNumber} está en producción. Pronto estará listo.`,
      'ready': `📦 Tu pedido ${orderNumber} está listo y será enviado pronto. ¡Ya casi!`,
    };

    return statusMessages[orderStatus] ??
      `📋 Tu pedido ${orderNumber} está en proceso (estado: ${orderStatus}).`;
  }

  private formatTrackingInfo(row: any): string {
    const statusEmoji: Record<string, string> = {
      'pending': '⏳',
      'picked_up': '📤',
      'in_transit': '🚚',
      'out_for_delivery': '🎉',
      'delivered': '✅',
      'returned': '↩️',
      'exception': '⚠️',
    };

    const emoji = statusEmoji[row.shipment_status] ?? '📦';

    let msg = `${emoji} *Estado de tu pedido ${row.order_number}*\n\n`;
    msg += `📦 Paquetería: ${row.carrier}\n`;
    msg += `🔢 Guía: ${row.tracking_number}\n`;
    msg += `📌 Estado: ${this.translateStatus(row.shipment_status)}\n`;

    if (row.estimated_delivery) {
      msg += `📅 Entrega estimada: ${this.formatDate(row.estimated_delivery)}\n`;
    }

    if (row.tracking_url) {
      msg += `\n🔗 Rastrear en línea:\n${row.tracking_url}`;
    }

    return msg;
  }

  private translateStatus(status: string): string {
    const map: Record<string, string> = {
      'pending': 'Preparando envío',
      'picked_up': 'Recolectado',
      'in_transit': 'En camino',
      'out_for_delivery': '¡Ya casi llega!',
      'delivered': 'Entregado ✅',
      'returned': 'Retornado',
      'exception': 'Incidencia',
    };
    return map[status] ?? status;
  }

  private formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch {
      return dateStr;
    }
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface ShipmentStatusEvent {
  tenantId: string;
  schemaName: string;
  shipmentId: string;
  orderId: string;
  newStatus: string;
  previousStatus?: string;
}
