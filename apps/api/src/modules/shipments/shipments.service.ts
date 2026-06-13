import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { MessagingService } from '../messaging/messaging.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';

const CARRIER_NAMES: Record<string, string> = {
  fedex: 'FedEx',
  dhl: 'DHL',
  estafeta: 'Estafeta',
  '99minutos': '99 Minutos',
  skydropx: 'Skydropx',
  otro: 'Paquetería',
};

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly messagingService: MessagingService,
  ) {}

  async findByOrder(orderId: string, schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, order_id AS "orderId", carrier,
        tracking_number AS "trackingNumber",
        tracking_url AS "trackingUrl",
        status, estimated_delivery AS "estimatedDelivery",
        created_at AS "createdAt"
      FROM "${schemaName}".shipments
      WHERE order_id = $1::uuid
      ORDER BY created_at DESC
    `, orderId);
  }

  async create(dto: CreateShipmentDto, schemaName: string) {
    // 1. Verificar que el pedido existe y está en estado 'ready'
    const order = await this.ordersService.findById(dto.orderId, schemaName);

    // 2. Crear registro de envío
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".shipments
        (order_id, carrier, tracking_number, tracking_url, status, estimated_delivery)
      VALUES ($1::uuid, $2, $3, $4, 'picked_up', $5)
      RETURNING id, carrier, tracking_number AS "trackingNumber",
                tracking_url AS "trackingUrl", status,
                estimated_delivery AS "estimatedDelivery",
                created_at AS "createdAt"
    `,
      dto.orderId,
      dto.carrier,
      dto.trackingNumber,
      dto.trackingUrl ?? this.buildTrackingUrl(dto.carrier, dto.trackingNumber),
      dto.estimatedDelivery ?? null,
    );

    const shipment = rows[0];

    // 3. Actualizar costo de envío en el pedido
    if (dto.cost) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".orders
        SET shipping_cost = $1,
            total = subtotal + $1,
            updated_at = NOW()
        WHERE id = $2::uuid
      `, dto.cost, dto.orderId);
    }

    // 4. Transicionar pedido a 'shipped'
    await this.ordersService.transition(dto.orderId, 'shipped', schemaName);

    // 5. Notificar al cliente por su canal
    const trackingUrl = shipment.trackingUrl ?? this.buildTrackingUrl(dto.carrier, dto.trackingNumber);
    const carrierName = CARRIER_NAMES[dto.carrier] ?? dto.carrier;

    const message =
      `📦 ¡Tu pedido ${order.orderNumber} está en camino!\n\n` +
      `Paquetería: ${carrierName}\n` +
      `Guía: ${dto.trackingNumber}\n` +
      (trackingUrl ? `Rastrear: ${trackingUrl}\n` : '') +
      (dto.estimatedDelivery ? `Entrega estimada: ${dto.estimatedDelivery}\n` : '') +
      `\nTe avisaremos cuando llegue. ¡Gracias por tu compra!`;

    await this.messagingService.sendText(
      order.customerChannelType,
      order.customerChannelId,
      message,
      schemaName,
    );

    this.logger.log(
      `Envío creado para ${order.orderNumber} — ${carrierName} ${dto.trackingNumber}`,
    );

    return {
      shipment,
      order: { orderNumber: order.orderNumber, status: 'shipped' },
      notification: 'Cliente notificado por ' + (order.customerChannelType ?? 'canal'),
    };
  }

  async updateStatus(
    shipmentId: string,
    status: string,
    schemaName: string,
  ) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".shipments
      SET status = $1
      WHERE id = $2::uuid
    `, status, shipmentId);

    return { success: true };
  }

  private buildTrackingUrl(carrier: string, trackingNumber: string): string | null {
    const urls: Record<string, string> = {
      fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
      dhl: `https://www.dhl.com/mx-es/home/rastreo.html?tracking-id=${trackingNumber}`,
      estafeta: `https://rastreo3.estafeta.com/Tracking/searchByGet?wayBillNumbers=${trackingNumber}`,
    };
    return urls[carrier] ?? null;
  }
}
