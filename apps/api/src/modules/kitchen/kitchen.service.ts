import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { EventsGateway } from '../events/events.gateway';

/**
 * Kitchen Display Service — Real-time order queue for kitchen staff.
 *
 * Order lifecycle in kitchen:
 * - PENDING:     status='payment_verified' (pagado, esperando producción)
 * - COOKING:     status='in_production' (cocinando)
 * - READY:       status='ready' (listo para entregar/enviar)
 *
 * Features:
 * - Real-time WebSocket push on status changes
 * - Timer calculation (minutes since order was paid)
 * - PDF ticket generation for thermal printers
 * - Stats: avg preparation time, orders today, pending count
 */

export interface KitchenOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  items: KitchenItem[];
  status: 'pending' | 'cooking' | 'ready';
  notes: string | null;
  channelType: string;
  hasDelivery: boolean;
  total: number;
  receivedAt: string;
  startedAt: string | null;
  readyAt: string | null;
  waitMinutes: number;
}

export interface KitchenItem {
  name: string;
  quantity: number;
  notes?: string;
}

export interface KitchenStats {
  pendingCount: number;
  cookingCount: number;
  readyCount: number;
  completedToday: number;
  avgPrepTimeMinutes: number;
}

export interface PrintTicketData {
  orderNumber: string;
  customerName: string;
  items: KitchenItem[];
  notes: string | null;
  total: number;
  receivedAt: string;
  channelType: string;
  hasDelivery: boolean;
  deliveryAddress?: string;
}

@Injectable()
export class KitchenService {
  private readonly logger = new Logger(KitchenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // ─── Kitchen Queue ────────────────────────────────────────────

  /**
   * Get all orders in the kitchen pipeline (pending + cooking + ready).
   */
  async getKitchenQueue(schemaName: string, tenantId: string): Promise<KitchenOrder[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        o.id, o.order_number AS "orderNumber",
        o.status, o.items, o.notes, o.total,
        o.channel_type AS "channelType",
        o.shipping_address AS "shippingAddress",
        o.created_at AS "createdAt",
        o.updated_at AS "updatedAt",
        c.name AS "customerName"
      FROM "${schemaName}".orders o
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      WHERE o.status IN ('payment_verified', 'in_production', 'ready')
      ORDER BY
        CASE o.status
          WHEN 'payment_verified' THEN 1
          WHEN 'in_production' THEN 2
          WHEN 'ready' THEN 3
        END,
        o.created_at ASC
    `);

    return rows.map(row => this.mapToKitchenOrder(row));
  }

  /**
   * Get only pending orders (waiting to start cooking).
   */
  async getPendingOrders(schemaName: string): Promise<KitchenOrder[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.id, o.order_number AS "orderNumber", o.status, o.items,
             o.notes, o.total, o.channel_type AS "channelType",
             o.shipping_address AS "shippingAddress",
             o.created_at AS "createdAt", o.updated_at AS "updatedAt",
             c.name AS "customerName"
      FROM "${schemaName}".orders o
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      WHERE o.status = 'payment_verified'
      ORDER BY o.created_at ASC
    `);

    return rows.map(row => this.mapToKitchenOrder(row));
  }

  // ─── Kitchen Actions ──────────────────────────────────────────

  /**
   * Start cooking an order (payment_verified → in_production).
   * Emits WebSocket event to update kitchen display.
   */
  async startCooking(orderId: string, schemaName: string, tenantId: string): Promise<KitchenOrder> {
    const order = await this.ordersService.transition(orderId, 'in_production', schemaName);

    // Emit real-time update
    this.eventsGateway.emitToTenant(tenantId, 'kitchen:order_started', {
      orderId,
      orderNumber: order.orderNumber,
      status: 'cooking',
      startedAt: new Date().toISOString(),
    });

    this.logger.log(`[${schemaName}] Kitchen: ${order.orderNumber} → cooking`);
    return this.mapToKitchenOrder(order);
  }

  /**
   * Mark order as ready (in_production → ready).
   * Emits WebSocket event.
   */
  async markReady(orderId: string, schemaName: string, tenantId: string): Promise<KitchenOrder> {
    const order = await this.ordersService.transition(orderId, 'ready', schemaName);

    // Emit real-time update
    this.eventsGateway.emitToTenant(tenantId, 'kitchen:order_ready', {
      orderId,
      orderNumber: order.orderNumber,
      status: 'ready',
      readyAt: new Date().toISOString(),
    });

    this.logger.log(`[${schemaName}] Kitchen: ${order.orderNumber} → ready`);
    return this.mapToKitchenOrder(order);
  }

  // ─── Kitchen Stats ────────────────────────────────────────────

  /**
   * Get kitchen statistics for today.
   */
  async getStats(schemaName: string): Promise<KitchenStats> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'payment_verified') AS "pendingCount",
        COUNT(*) FILTER (WHERE status = 'in_production') AS "cookingCount",
        COUNT(*) FILTER (WHERE status = 'ready') AS "readyCount",
        COUNT(*) FILTER (WHERE status IN ('shipped', 'delivered') AND updated_at::date = CURRENT_DATE) AS "completedToday",
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60)
          FILTER (WHERE status IN ('ready', 'shipped', 'delivered') AND updated_at::date = CURRENT_DATE),
          0
        ) AS "avgPrepTime"
      FROM "${schemaName}".orders
      WHERE status IN ('payment_verified', 'in_production', 'ready', 'shipped', 'delivered')
    `);

    const stats = rows[0] ?? {};
    return {
      pendingCount: parseInt(stats.pendingCount ?? '0'),
      cookingCount: parseInt(stats.cookingCount ?? '0'),
      readyCount: parseInt(stats.readyCount ?? '0'),
      completedToday: parseInt(stats.completedToday ?? '0'),
      avgPrepTimeMinutes: Math.round(parseFloat(stats.avgPrepTime ?? '0')),
    };
  }

  // ─── Print Ticket ─────────────────────────────────────────────

  /**
   * Generate printable ticket data for a specific order.
   * Returns structured data that the frontend renders as a thermal ticket.
   */
  async getTicketData(orderId: string, schemaName: string): Promise<PrintTicketData> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.order_number AS "orderNumber", o.items, o.notes, o.total,
             o.channel_type AS "channelType", o.shipping_address AS "shippingAddress",
             o.created_at AS "receivedAt",
             c.name AS "customerName", c.phone AS "customerPhone"
      FROM "${schemaName}".orders o
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      WHERE o.id = $1::uuid
    `, orderId);

    if (!rows[0]) throw new NotFoundException('Pedido no encontrado');

    const order = rows[0];
    const items = this.parseItems(order.items);
    const address = order.shippingAddress;

    return {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      items,
      notes: order.notes,
      total: parseFloat(order.total),
      receivedAt: order.receivedAt,
      channelType: order.channelType,
      hasDelivery: !!address,
      deliveryAddress: address
        ? `${address.street ?? ''}, ${address.city ?? ''} ${address.references ?? ''}`
        : undefined,
    };
  }

  /**
   * Generate a plain-text ticket (for simple thermal printers).
   */
  async getPlainTextTicket(orderId: string, schemaName: string): Promise<string> {
    const data = await this.getTicketData(orderId, schemaName);
    const now = new Date();

    let ticket = '';
    ticket += '================================\n';
    ticket += '        TICKET DE COCINA        \n';
    ticket += '================================\n';
    ticket += `Pedido: ${data.orderNumber}\n`;
    ticket += `Cliente: ${data.customerName}\n`;
    ticket += `Canal: ${data.channelType}\n`;
    ticket += `Hora: ${now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}\n`;
    ticket += '--------------------------------\n';

    for (const item of data.items) {
      ticket += `${item.quantity}x ${item.name}\n`;
      if (item.notes) ticket += `   → ${item.notes}\n`;
    }

    ticket += '--------------------------------\n';
    ticket += `TOTAL: $${data.total.toLocaleString()} MXN\n`;

    if (data.notes) {
      ticket += '--------------------------------\n';
      ticket += `NOTAS: ${data.notes}\n`;
    }

    if (data.hasDelivery) {
      ticket += '--------------------------------\n';
      ticket += `🛵 ENVÍO: ${data.deliveryAddress}\n`;
    } else {
      ticket += '--------------------------------\n';
      ticket += '📍 RECOGER EN MOSTRADOR\n';
    }

    ticket += '================================\n';

    return ticket;
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private mapToKitchenOrder(row: any): KitchenOrder {
    const items = this.parseItems(row.items);
    const createdAt = new Date(row.createdAt ?? row.created_at);
    const updatedAt = new Date(row.updatedAt ?? row.updated_at ?? createdAt);
    const now = Date.now();

    let kitchenStatus: 'pending' | 'cooking' | 'ready';
    let startedAt: string | null = null;
    let readyAt: string | null = null;

    switch (row.status) {
      case 'payment_verified':
        kitchenStatus = 'pending';
        break;
      case 'in_production':
        kitchenStatus = 'cooking';
        startedAt = updatedAt.toISOString();
        break;
      case 'ready':
        kitchenStatus = 'ready';
        readyAt = updatedAt.toISOString();
        break;
      default:
        kitchenStatus = 'pending';
    }

    const waitMinutes = Math.round((now - createdAt.getTime()) / 60000);

    return {
      id: row.id,
      orderNumber: row.orderNumber ?? row.order_number,
      customerName: row.customerName ?? row.customer_name ?? 'Cliente',
      items,
      status: kitchenStatus,
      notes: row.notes,
      channelType: row.channelType ?? row.channel_type,
      hasDelivery: !!(row.shippingAddress ?? row.shipping_address),
      total: parseFloat(row.total ?? 0),
      receivedAt: createdAt.toISOString(),
      startedAt,
      readyAt,
      waitMinutes,
    };
  }

  private parseItems(items: any): KitchenItem[] {
    const parsed = typeof items === 'string' ? JSON.parse(items) : (items ?? []);
    return parsed.map((item: any) => ({
      name: item.productName ?? item.name ?? '?',
      quantity: item.quantity ?? 1,
      notes: item.notes ?? item.variant ?? undefined,
    }));
  }
}
