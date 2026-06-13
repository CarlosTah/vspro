import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { MessagingService } from '../messaging/messaging.service';

@Injectable()
export class ProductionService {
  private readonly logger = new Logger(ProductionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly messagingService: MessagingService,
  ) {}

  /**
   * Cola de producción: pedidos en estado payment_verified o in_production.
   */
  async getQueue(schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        o.id, o.order_number AS "orderNumber",
        o.status, o.items, o.total, o.notes,
        o.assigned_to AS "assignedTo",
        o.created_at AS "createdAt", o.updated_at AS "updatedAt",
        c.name AS "customerName", c.phone AS "customerPhone",
        c.channel_type AS "customerChannelType",
        c.channel_id AS "customerChannelId",
        u.name AS "assignedToName"
      FROM "${schemaName}".orders o
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      LEFT JOIN "${schemaName}".users u ON u.id = o.assigned_to
      WHERE o.status IN ('payment_verified', 'in_production')
      ORDER BY o.created_at ASC
    `);
  }

  /**
   * Pedidos listos para envío (ya salieron de producción).
   */
  async getReadyForShipment(schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        o.id, o.order_number AS "orderNumber",
        o.status, o.total, o.shipping_address AS "shippingAddress",
        o.updated_at AS "updatedAt",
        c.name AS "customerName", c.phone AS "customerPhone",
        c.channel_id AS "customerChannelId",
        c.channel_type AS "customerChannelType"
      FROM "${schemaName}".orders o
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      WHERE o.status = 'ready'
      ORDER BY o.updated_at ASC
    `);
  }

  /**
   * Iniciar producción de un pedido.
   * Cambia estado a in_production y opcionalmente asigna a un operador.
   */
  async startProduction(
    orderId: string,
    assignedTo: string | undefined,
    schemaName: string,
  ) {
    // Transicionar el pedido
    const order = await this.ordersService.transition(
      orderId,
      'in_production',
      schemaName,
      assignedTo,
    );

    this.logger.log(`Pedido ${order.orderNumber} en producción`);
    return order;
  }

  /**
   * Marcar pedido como listo.
   * Notifica automáticamente al cliente por el canal donde hizo el pedido.
   */
  async markReady(orderId: string, schemaName: string) {
    const order = await this.ordersService.transition(orderId, 'ready', schemaName);

    // Obtener datos del cliente para notificar
    const fullOrder = await this.ordersService.findById(orderId, schemaName);

    // Notificar al cliente
    const message = `🎉 ¡Tu pedido ${fullOrder.orderNumber} está listo!\n\n` +
      `Total: $${fullOrder.total}\n\n` +
      `Para coordinar la entrega, ¿confirmas tu dirección de envío?`;

    await this.messagingService.sendText(
      fullOrder.customerChannelType,
      fullOrder.customerChannelId,
      message,
      schemaName,
    );

    this.logger.log(
      `Pedido ${fullOrder.orderNumber} listo — cliente notificado por ${fullOrder.customerChannelType}`,
    );

    return order;
  }

  /**
   * Estadísticas de producción del día.
   */
  async getStats(schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'payment_verified') AS "pendingProduction",
        COUNT(*) FILTER (WHERE status = 'in_production') AS "inProduction",
        COUNT(*) FILTER (WHERE status = 'ready') AS "readyForShipment",
        COUNT(*) FILTER (WHERE status = 'shipped') AS "shipped",
        COUNT(*) FILTER (WHERE status = 'delivered'
          AND updated_at >= CURRENT_DATE) AS "deliveredToday"
      FROM "${schemaName}".orders
    `);

    const stats = rows[0];
    return {
      pendingProduction: parseInt(stats.pendingProduction) || 0,
      inProduction: parseInt(stats.inProduction) || 0,
      readyForShipment: parseInt(stats.readyForShipment) || 0,
      shipped: parseInt(stats.shipped) || 0,
      deliveredToday: parseInt(stats.deliveredToday) || 0,
    };
  }
}
