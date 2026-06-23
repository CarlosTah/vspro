import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { isValidTransition, OrderStatus } from '@vspro/shared';
import { OrderNotificationsService } from './order-notifications.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: OrderNotificationsService,
  ) {}

  // ─── Consultas ────────────────────────────────────────────────

  async findAll(schemaName: string, status?: string) {
    const where = status ? `WHERE o.status = $1` : '';
    const params = status ? [status] : [];

    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        o.id, o.order_number AS "orderNumber",
        o.status, o.total, o.subtotal, o.shipping_cost AS "shippingCost",
        o.channel_type AS "channelType", o.notes,
        o.created_at AS "createdAt", o.updated_at AS "updatedAt",
        c.id AS "customerId", c.name AS "customerName",
        c.channel_id AS "customerChannelId"
      FROM "${schemaName}".orders o
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      ${where}
      ORDER BY o.created_at DESC
    `, ...params);
  }

  async findById(id: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        o.id, o.order_number AS "orderNumber",
        o.status, o.items, o.total, o.subtotal,
        o.shipping_cost AS "shippingCost",
        o.channel_type AS "channelType",
        o.notes, o.shipping_address AS "shippingAddress",
        o.created_at AS "createdAt", o.updated_at AS "updatedAt",
        c.id AS "customerId", c.name AS "customerName",
        c.phone AS "customerPhone", c.channel_id AS "customerChannelId"
      FROM "${schemaName}".orders o
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      WHERE o.id = $1::uuid
    `, id);

    if (!rows[0]) throw new NotFoundException(`Pedido ${id} no encontrado`);
    return rows[0];
  }

  async findByOrderNumber(orderNumber: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.*, c.name AS "customerName"
      FROM "${schemaName}".orders o
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      WHERE o.order_number = $1
    `, orderNumber);

    if (!rows[0]) throw new NotFoundException(`Pedido ${orderNumber} no encontrado`);
    return rows[0];
  }

  // ─── Creación ─────────────────────────────────────────────────

  async create(dto: CreateOrderDto, schemaName: string) {
    // 1. Verificar que el cliente existe
    const customers = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "${schemaName}".customers WHERE id = $1::uuid`,
      dto.customerId,
    );
    if (!customers[0]) throw new NotFoundException('Cliente no encontrado');

    // 2. Resolver productos y calcular totales
    const resolvedItems = await this.resolveItems(dto.items, schemaName);

    const subtotal = resolvedItems.reduce((sum, i) => sum + i.subtotal, 0);
    const total = subtotal; // shipping_cost se agrega después

    // 3. Generar número de pedido único
    const orderNumber = await this.generateOrderNumber(schemaName);

    // 4. Crear el pedido
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".orders
        (order_number, customer_id, channel_type, status, items,
         subtotal, shipping_cost, total, notes, shipping_address)
      VALUES ($1, $2::uuid, $3, 'new', $4::jsonb, $5, 0, $6, $7, $8::jsonb)
      RETURNING id, order_number AS "orderNumber", status, total,
                subtotal, created_at AS "createdAt"
    `,
      orderNumber,
      dto.customerId,
      dto.channelType,
      JSON.stringify(resolvedItems),
      subtotal,
      total,
      dto.notes ?? null,
      dto.shippingAddress ? JSON.stringify(dto.shippingAddress) : null,
    );

    const order = rows[0];

    // 5. Reservar stock
    await this.reserveStock(resolvedItems, schemaName);

    return order;
  }

  // ─── Transiciones de estado ───────────────────────────────────

  async transition(
    id: string,
    newStatus: OrderStatus,
    schemaName: string,
    userId?: string,
  ) {
    const order = await this.findById(id, schemaName);
    const currentStatus = order.status as OrderStatus;

    if (!isValidTransition(currentStatus, newStatus)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_STATE_TRANSITION',
        message: `No se puede pasar de '${currentStatus}' a '${newStatus}'`,
        currentStatus,
        requestedStatus: newStatus,
      });
    }

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".orders
      SET status = $1,
          assigned_to = COALESCE($2, assigned_to),
          updated_at = NOW()
      WHERE id = $3::uuid
    `, newStatus, userId ?? null, id);

    // Si se cancela, liberar stock reservado
    if (newStatus === 'cancelled') {
      const items = typeof order.items === 'string'
        ? JSON.parse(order.items)
        : order.items;
      await this.releaseStock(items, schemaName);
    }

    // Notificar al cliente automáticamente (non-blocking)
    this.notifications.notify(id, newStatus, schemaName).catch(() => {});

    return this.findById(id, schemaName);
  }

  async updateShippingAddress(
    id: string,
    address: Record<string, any>,
    schemaName: string,
  ) {
    await this.findById(id, schemaName);
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".orders
      SET shipping_address = $1::jsonb, updated_at = NOW()
      WHERE id = $2::uuid
    `, JSON.stringify(address), id);
    return this.findById(id, schemaName);
  }

  // ─── Helpers privados ─────────────────────────────────────────

  private async resolveItems(
    items: { productId: string; quantity: number }[],
    schemaName: string,
  ) {
    const resolved = [];

    for (const item of items) {
      const products = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT p.id, p.name, p.price, p.sku,
               i.stock_available AS "stockAvailable"
        FROM "${schemaName}".products p
        JOIN "${schemaName}".inventory i ON i.product_id = p.id
        WHERE p.id = $1::uuid AND p.is_active = true
      `, item.productId);

      if (!products[0]) {
        throw new NotFoundException(`Producto ${item.productId} no encontrado o inactivo`);
      }

      const product = products[0];

      if (product.stockAvailable < item.quantity) {
        throw new BadRequestException(
          `Stock insuficiente para '${product.name}'. Disponible: ${product.stockAvailable}, solicitado: ${item.quantity}`,
        );
      }

      resolved.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: item.quantity,
        unitPrice: parseFloat(product.price),
        subtotal: parseFloat(product.price) * item.quantity,
      });
    }

    return resolved;
  }

  private async reserveStock(
    items: { productId: string; quantity: number }[],
    schemaName: string,
  ) {
    for (const item of items) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".inventory
        SET stock_available = stock_available - $1,
            stock_reserved  = stock_reserved  + $1,
            updated_at      = NOW()
        WHERE product_id = $2::uuid
      `, item.quantity, item.productId);
    }
  }

  private async releaseStock(
    items: { productId: string; quantity: number }[],
    schemaName: string,
  ) {
    for (const item of items) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".inventory
        SET stock_available = stock_available + $1,
            stock_reserved  = GREATEST(0, stock_reserved - $1),
            updated_at      = NOW()
        WHERE product_id = $2::uuid
      `, item.quantity, item.productId);
    }
  }

  private async generateOrderNumber(schemaName: string): Promise<string> {
    const year = new Date().getFullYear();
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) AS count
      FROM "${schemaName}".orders
      WHERE EXTRACT(YEAR FROM created_at) = $1
    `, year);

    const count = parseInt(rows[0].count) + 1;
    return `ORD-${year}-${String(count).padStart(5, '0')}`;
  }

  // ─── Analytics: Cancellations ─────────────────────────────────

  async getCancellationMetrics(schemaName: string) {
    try {
      // Overall stats
      const stats = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          COUNT(*) AS "totalOrders",
          COUNT(*) FILTER (WHERE status = 'cancelled') AS "cancelledOrders",
          COALESCE(SUM(total) FILTER (WHERE status = 'cancelled'), 0) AS "lostRevenue",
          COALESCE(SUM(total) FILTER (WHERE status = 'delivered'), 0) AS "deliveredRevenue"
        FROM "${schemaName}".orders
      `);

      const s = stats[0] ?? {};
      const totalOrders = parseInt(s.totalOrders) || 0;
      const cancelledOrders = parseInt(s.cancelledOrders) || 0;
      const cancellationRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

      // This month stats
      const monthStats = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          COUNT(*) AS "totalOrders",
          COUNT(*) FILTER (WHERE status = 'cancelled') AS "cancelledOrders",
          COALESCE(SUM(total) FILTER (WHERE status = 'cancelled'), 0) AS "lostRevenue"
        FROM "${schemaName}".orders
        WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
      `);

      const m = monthStats[0] ?? {};

      // Cancellation reasons (extracted from notes)
      const reasons = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          CASE
            WHEN notes ILIKE '%cambio de opinión%' OR notes ILIKE '%ya no quiero%' THEN 'Cambio de opinión'
            WHEN notes ILIKE '%tardó%' OR notes ILIKE '%tarda%' OR notes ILIKE '%demora%' THEN 'Demora en entrega'
            WHEN notes ILIKE '%equivoc%' OR notes ILIKE '%incorrecto%' THEN 'Pedido incorrecto'
            WHEN notes ILIKE '%precio%' OR notes ILIKE '%caro%' THEN 'Precio'
            WHEN notes ILIKE '%duplicado%' THEN 'Pedido duplicado'
            ELSE 'Otro'
          END AS reason,
          COUNT(*) AS count
        FROM "${schemaName}".orders
        WHERE status = 'cancelled'
        GROUP BY reason
        ORDER BY count DESC
        LIMIT 10
      `);

      // Recent cancellations
      const recent = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT o.order_number AS "orderNumber", o.total, o.notes,
               o.created_at AS "createdAt", c.name AS "customerName"
        FROM "${schemaName}".orders o
        LEFT JOIN "${schemaName}".customers c ON c.id = o.customer_id
        WHERE o.status = 'cancelled'
        ORDER BY o.updated_at DESC
        LIMIT 10
      `);

      return {
        overall: {
          totalOrders,
          cancelledOrders,
          cancellationRate: Math.round(cancellationRate * 10) / 10,
          lostRevenue: parseFloat(s.lostRevenue) || 0,
          deliveredRevenue: parseFloat(s.deliveredRevenue) || 0,
        },
        thisMonth: {
          totalOrders: parseInt(m.totalOrders) || 0,
          cancelledOrders: parseInt(m.cancelledOrders) || 0,
          lostRevenue: parseFloat(m.lostRevenue) || 0,
        },
        reasons: reasons.map(r => ({ reason: r.reason, count: parseInt(r.count) || 0 })),
        recent: recent.map(r => ({
          orderNumber: r.orderNumber,
          total: parseFloat(r.total) || 0,
          customerName: r.customerName ?? 'N/A',
          reason: r.notes?.match(/\[CANCELADO: (.+?)\]/)?.[1] ?? 'Sin motivo',
          date: r.createdAt,
        })),
      };
    } catch {
      return {
        overall: { totalOrders: 0, cancelledOrders: 0, cancellationRate: 0, lostRevenue: 0, deliveredRevenue: 0 },
        thisMonth: { totalOrders: 0, cancelledOrders: 0, lostRevenue: 0 },
        reasons: [],
        recent: [],
      };
    }
  }
}
