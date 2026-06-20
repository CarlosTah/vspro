import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MessagingFactory } from '../messaging/messaging-factory.service';
import { OrdersService } from '../orders/orders.service';
import { EventsGateway } from '../events/events.gateway';

/**
 * Delivery Service — Gestión de motorepartidores por WhatsApp.
 *
 * Responsibilities:
 * - CRUD de repartidores (drivers)
 * - Asignación automática de pedidos a repartidores
 * - Envío de solicitud de entrega por WhatsApp
 * - Tracking de asignaciones (offered → accepted → picked_up → delivered)
 * - Rotación de repartidores (round-robin por disponibilidad)
 * - Notificación al cliente cuando el repartidor está en camino
 */

export interface DeliveryDriver {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  status: 'available' | 'busy' | 'offline';
  activeDeliveries: number;
  maxDeliveries: number;
  createdAt: string;
}

export interface DeliveryAssignment {
  id: string;
  orderId: string;
  orderNumber: string;
  driverId: string;
  driverName: string;
  status: 'offered' | 'accepted' | 'picked_up' | 'delivered' | 'rejected' | 'cancelled';
  offeredAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  customerName: string;
  deliveryAddress: string;
  total: number;
}

export interface CreateDriverDto {
  name: string;
  phone: string;
  vehicleType?: string;
  maxDeliveries?: number;
}

export interface RequestDeliveryDto {
  orderId: string;
  driverId?: string; // optional: specific driver, otherwise auto-assign
}

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingFactory: MessagingFactory,
    private readonly ordersService: OrdersService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // ─── Driver Management ────────────────────────────────────────

  async getDrivers(schemaName: string): Promise<DeliveryDriver[]> {
    return this.prisma.$queryRawUnsafe<DeliveryDriver[]>(`
      SELECT d.id, d.name, d.phone, d.vehicle_type AS "vehicleType",
             d.status, d.max_deliveries AS "maxDeliveries",
             d.created_at AS "createdAt",
             COUNT(a.id) FILTER (WHERE a.status IN ('accepted', 'picked_up')) AS "activeDeliveries"
      FROM "${schemaName}".delivery_drivers d
      LEFT JOIN "${schemaName}".delivery_assignments a ON a.driver_id = d.id
      GROUP BY d.id
      ORDER BY d.name
    `);
  }

  async getAvailableDrivers(schemaName: string): Promise<DeliveryDriver[]> {
    return this.prisma.$queryRawUnsafe<DeliveryDriver[]>(`
      SELECT d.id, d.name, d.phone, d.vehicle_type AS "vehicleType",
             d.status, d.max_deliveries AS "maxDeliveries",
             COUNT(a.id) FILTER (WHERE a.status IN ('accepted', 'picked_up')) AS "activeDeliveries"
      FROM "${schemaName}".delivery_drivers d
      LEFT JOIN "${schemaName}".delivery_assignments a ON a.driver_id = d.id
      WHERE d.status = 'available'
      GROUP BY d.id
      HAVING COUNT(a.id) FILTER (WHERE a.status IN ('accepted', 'picked_up')) < d.max_deliveries
      ORDER BY COUNT(a.id) FILTER (WHERE a.status IN ('accepted', 'picked_up')) ASC
    `);
  }

  async createDriver(dto: CreateDriverDto, schemaName: string): Promise<DeliveryDriver> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".delivery_drivers (name, phone, vehicle_type, max_deliveries, status)
      VALUES ($1, $2, $3, $4, 'available')
      RETURNING id, name, phone, vehicle_type AS "vehicleType", status,
                max_deliveries AS "maxDeliveries", created_at AS "createdAt"
    `, dto.name, dto.phone, dto.vehicleType ?? 'moto', dto.maxDeliveries ?? 3);

    return { ...rows[0], activeDeliveries: 0 };
  }

  async updateDriverStatus(driverId: string, status: 'available' | 'busy' | 'offline', schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".delivery_drivers SET status = $1 WHERE id = $2::uuid
    `, status, driverId);
  }

  async deleteDriver(driverId: string, schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      DELETE FROM "${schemaName}".delivery_drivers WHERE id = $1::uuid
    `, driverId);
  }

  // ─── Delivery Request & Assignment ────────────────────────────

  /**
   * Request delivery for an order.
   * If driverId is specified, offers to that driver.
   * Otherwise, auto-assigns to the least busy available driver.
   */
  async requestDelivery(
    dto: RequestDeliveryDto,
    schemaName: string,
    tenantId: string,
  ): Promise<DeliveryAssignment> {
    // 1. Get order details
    const order = await this.ordersService.findById(dto.orderId, schemaName);

    if (!order.shippingAddress) {
      throw new BadRequestException('El pedido no tiene dirección de envío');
    }

    if (order.status !== 'ready') {
      throw new BadRequestException(`El pedido debe estar "listo" para envío. Status actual: ${order.status}`);
    }

    // 2. Find driver
    let driver: any;
    if (dto.driverId) {
      const drivers = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT id, name, phone, status FROM "${schemaName}".delivery_drivers WHERE id = $1::uuid
      `, dto.driverId);
      if (!drivers[0]) throw new NotFoundException('Repartidor no encontrado');
      driver = drivers[0];
    } else {
      const available = await this.getAvailableDrivers(schemaName);
      if (available.length === 0) {
        throw new BadRequestException('No hay repartidores disponibles en este momento');
      }
      driver = available[0]; // Least busy
    }

    // 3. Create assignment
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".delivery_assignments
        (order_id, driver_id, status, offered_at)
      VALUES ($1::uuid, $2::uuid, 'offered', NOW())
      RETURNING id, offered_at AS "offeredAt"
    `, dto.orderId, driver.id);

    const assignment = rows[0];

    // 4. Send WhatsApp to driver
    const address = this.formatAddress(order.shippingAddress);
    const items = this.formatItems(order.items);
    const message = this.buildDriverMessage(order, driver.name, address, items);

    await this.messagingFactory.sendText(
      driver.phone,
      message,
      'whatsapp',
      schemaName,
    );

    // 5. Emit event
    this.eventsGateway.emitToTenant(tenantId, 'delivery:offered', {
      assignmentId: assignment.id,
      orderId: dto.orderId,
      orderNumber: order.orderNumber,
      driverName: driver.name,
    });

    this.logger.log(`[${schemaName}] Delivery offered: ${order.orderNumber} → ${driver.name}`);

    return {
      id: assignment.id,
      orderId: dto.orderId,
      orderNumber: order.orderNumber,
      driverId: driver.id,
      driverName: driver.name,
      status: 'offered',
      offeredAt: assignment.offeredAt,
      acceptedAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      customerName: order.customerName,
      deliveryAddress: address,
      total: parseFloat(order.total),
    };
  }

  /**
   * Driver accepts the delivery.
   * Transitions order to "shipped".
   */
  async acceptDelivery(
    assignmentId: string,
    schemaName: string,
    tenantId: string,
  ): Promise<DeliveryAssignment> {
    const assignment = await this.getAssignment(assignmentId, schemaName);
    if (assignment.status !== 'offered') {
      throw new BadRequestException(`No se puede aceptar: status actual es "${assignment.status}"`);
    }

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".delivery_assignments
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = $1::uuid
    `, assignmentId);

    // Transition order to shipped
    await this.ordersService.transition(assignment.orderId, 'shipped', schemaName);

    this.eventsGateway.emitToTenant(tenantId, 'delivery:accepted', {
      assignmentId,
      orderNumber: assignment.orderNumber,
      driverName: assignment.driverName,
    });

    this.logger.log(`[${schemaName}] Delivery accepted: ${assignment.orderNumber} by ${assignment.driverName}`);
    return { ...assignment, status: 'accepted', acceptedAt: new Date().toISOString() };
  }

  /**
   * Driver confirms pickup (has the food).
   */
  async confirmPickup(
    assignmentId: string,
    schemaName: string,
    tenantId: string,
  ): Promise<DeliveryAssignment> {
    const assignment = await this.getAssignment(assignmentId, schemaName);
    if (assignment.status !== 'accepted') {
      throw new BadRequestException('El pedido no ha sido aceptado aún');
    }

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".delivery_assignments
      SET status = 'picked_up', picked_up_at = NOW()
      WHERE id = $1::uuid
    `, assignmentId);

    this.eventsGateway.emitToTenant(tenantId, 'delivery:picked_up', {
      assignmentId,
      orderNumber: assignment.orderNumber,
      driverName: assignment.driverName,
    });

    return { ...assignment, status: 'picked_up', pickedUpAt: new Date().toISOString() };
  }

  /**
   * Driver confirms delivery complete.
   * Transitions order to "delivered".
   */
  async confirmDelivery(
    assignmentId: string,
    schemaName: string,
    tenantId: string,
  ): Promise<DeliveryAssignment> {
    const assignment = await this.getAssignment(assignmentId, schemaName);
    if (assignment.status !== 'picked_up' && assignment.status !== 'accepted') {
      throw new BadRequestException('El pedido no ha sido recogido aún');
    }

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".delivery_assignments
      SET status = 'delivered', delivered_at = NOW()
      WHERE id = $1::uuid
    `, assignmentId);

    // Transition order to delivered
    await this.ordersService.transition(assignment.orderId, 'delivered', schemaName);

    this.eventsGateway.emitToTenant(tenantId, 'delivery:completed', {
      assignmentId,
      orderNumber: assignment.orderNumber,
      driverName: assignment.driverName,
    });

    this.logger.log(`[${schemaName}] Delivery completed: ${assignment.orderNumber}`);
    return { ...assignment, status: 'delivered', deliveredAt: new Date().toISOString() };
  }

  /**
   * Driver rejects — offer to next available driver.
   */
  async rejectDelivery(
    assignmentId: string,
    schemaName: string,
    tenantId: string,
  ): Promise<{ rejected: true; reassigned: boolean; newDriverName?: string }> {
    const assignment = await this.getAssignment(assignmentId, schemaName);

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".delivery_assignments SET status = 'rejected' WHERE id = $1::uuid
    `, assignmentId);

    // Try to assign to next available driver (excluding the one who rejected)
    const available = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT d.id, d.name, d.phone FROM "${schemaName}".delivery_drivers d
      WHERE d.status = 'available' AND d.id != $1::uuid
      ORDER BY RANDOM() LIMIT 1
    `, assignment.driverId);

    if (available[0]) {
      await this.requestDelivery(
        { orderId: assignment.orderId, driverId: available[0].id },
        schemaName,
        tenantId,
      );
      return { rejected: true, reassigned: true, newDriverName: available[0].name };
    }

    this.eventsGateway.notifyTenant(tenantId, {
      type: 'delivery_no_drivers',
      title: 'Sin repartidores',
      message: `El pedido ${assignment.orderNumber} no tiene repartidor disponible`,
      data: { orderId: assignment.orderId },
    });

    return { rejected: true, reassigned: false };
  }

  // ─── Assignments Query ────────────────────────────────────────

  async getActiveDeliveries(schemaName: string): Promise<DeliveryAssignment[]> {
    return this.prisma.$queryRawUnsafe<DeliveryAssignment[]>(`
      SELECT a.id, a.order_id AS "orderId", a.status,
             a.offered_at AS "offeredAt", a.accepted_at AS "acceptedAt",
             a.picked_up_at AS "pickedUpAt", a.delivered_at AS "deliveredAt",
             o.order_number AS "orderNumber", o.total,
             o.shipping_address AS "shippingAddress",
             d.name AS "driverName", d.id AS "driverId",
             c.name AS "customerName"
      FROM "${schemaName}".delivery_assignments a
      JOIN "${schemaName}".orders o ON o.id = a.order_id
      JOIN "${schemaName}".delivery_drivers d ON d.id = a.driver_id
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      WHERE a.status IN ('offered', 'accepted', 'picked_up')
      ORDER BY a.offered_at DESC
    `);
  }

  async getDeliveryHistory(schemaName: string, limit = 20): Promise<DeliveryAssignment[]> {
    return this.prisma.$queryRawUnsafe<DeliveryAssignment[]>(`
      SELECT a.id, a.order_id AS "orderId", a.status,
             a.offered_at AS "offeredAt", a.accepted_at AS "acceptedAt",
             a.picked_up_at AS "pickedUpAt", a.delivered_at AS "deliveredAt",
             o.order_number AS "orderNumber", o.total,
             d.name AS "driverName", c.name AS "customerName"
      FROM "${schemaName}".delivery_assignments a
      JOIN "${schemaName}".orders o ON o.id = a.order_id
      JOIN "${schemaName}".delivery_drivers d ON d.id = a.driver_id
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      ORDER BY a.offered_at DESC LIMIT $1
    `, limit);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async getAssignment(id: string, schemaName: string): Promise<DeliveryAssignment> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT a.id, a.order_id AS "orderId", a.driver_id AS "driverId", a.status,
             a.offered_at AS "offeredAt", a.accepted_at AS "acceptedAt",
             a.picked_up_at AS "pickedUpAt", a.delivered_at AS "deliveredAt",
             o.order_number AS "orderNumber", o.total, o.shipping_address,
             d.name AS "driverName", c.name AS "customerName"
      FROM "${schemaName}".delivery_assignments a
      JOIN "${schemaName}".orders o ON o.id = a.order_id
      JOIN "${schemaName}".delivery_drivers d ON d.id = a.driver_id
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      WHERE a.id = $1::uuid
    `, id);

    if (!rows[0]) throw new NotFoundException('Asignación de delivery no encontrada');
    return {
      ...rows[0],
      deliveryAddress: this.formatAddress(rows[0].shipping_address),
      total: parseFloat(rows[0].total),
    };
  }

  private buildDriverMessage(order: any, driverName: string, address: string, items: string): string {
    return `🛵 *Nuevo pedido para entrega*

Hola ${driverName}, hay un pedido listo:

📋 *Pedido:* ${order.orderNumber}
👤 *Cliente:* ${order.customerName}
📍 *Entregar en:* ${address}
📦 *Contenido:*
${items}
💰 *Total:* $${parseFloat(order.total).toLocaleString()} MXN

¿Aceptas la entrega?
Responde *SÍ* o *NO*`;
  }

  private formatAddress(address: any): string {
    if (!address) return 'Sin dirección';
    if (typeof address === 'string') return address;
    const parts = [address.street, address.city, address.state, address.references].filter(Boolean);
    return parts.join(', ') || 'Sin dirección';
  }

  private formatItems(items: any): string {
    const parsed = typeof items === 'string' ? JSON.parse(items) : (items ?? []);
    return parsed.map((i: any) => `  • ${i.quantity}x ${i.productName ?? i.name}`).join('\n');
  }

  // ─── External Dispatch (Moto-Mandados) ────────────────────────

  /**
   * Dispatch an order to an external driver (not registered in the system).
   * Sends WhatsApp with tracking link. Driver confirms via the public tracking page.
   */
  async dispatchExternal(
    orderId: string,
    phone: string,
    driverName: string | undefined,
    schemaName: string,
    tenantId: string,
  ) {
    const order = await this.ordersService.findById(orderId, schemaName);

    // Generate tracking token
    const trackingToken = this.generateToken();

    // Create assignment
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".delivery_assignments
        (order_id, driver_id, status, offered_at, tracking_token, is_external, external_phone)
      VALUES ($1::uuid, NULL, 'offered', NOW(), $2, true, $3)
    `, orderId, trackingToken, phone);

    // Build tracking URL
    const appUrl = 'https://app.vspro.app';
    const trackingUrl = `${appUrl}/track/${orderId}/${trackingToken}`;

    // Build message
    const address = this.formatAddress(order.shippingAddress);
    const items = this.formatItems(order.items);
    const name = driverName ?? 'Repartidor';

    const message = `🛵 *Pedido para entrega*\n\n` +
      `📋 Pedido: ${order.orderNumber}\n` +
      `📍 Dirección: ${address}\n` +
      `💰 Total: $${parseFloat(order.total).toLocaleString('es-MX')}\n` +
      `📦 Productos:\n${items}\n\n` +
      `👉 Acepta y confirma desde aquí:\n${trackingUrl}`;

    // Send WhatsApp
    const result = await this.messagingFactory.sendText(phone, message, 'whatsapp', schemaName);

    this.logger.log(`[${schemaName}] External dispatch: ${order.orderNumber} → ${phone} (token: ${trackingToken})`);

    return {
      success: result.success,
      orderNumber: order.orderNumber,
      phone,
      trackingUrl,
      trackingToken,
      message: result.success
        ? `Enviado a ${name} (${phone}). Link de seguimiento: ${trackingUrl}`
        : `Error al enviar: ${result.error}`,
    };
  }

  private generateToken(): string {
    return Array.from({ length: 16 }, () => Math.random().toString(36)[2]).join('');
  }
}
