import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PerformanceMetrics } from './dto/reports.dto';

/**
 * Performance Metrics Reports.
 * Aggregates fulfillment speed, AI automation rates, product performance,
 * and channel breakdown.
 * Dependencies: OrdersService, ShipmentService
 */
@Injectable()
export class ReportsPerformanceService {
  private readonly logger = new Logger(ReportsPerformanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPerformanceMetrics(schemaName: string, from: string, to: string): Promise<PerformanceMetrics> {
    const [fulfillment, ai, products, channels] = await Promise.all([
      this.getFulfillmentMetrics(schemaName, from, to),
      this.getAiMetrics(schemaName, from, to),
      this.getProductMetrics(schemaName, from, to),
      this.getChannelMetrics(schemaName, from, to),
    ]);

    return { period: { from, to }, fulfillment, ai, products, channels };
  }

  private async getFulfillmentMetrics(schema: string, from: string, to: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        AVG(EXTRACT(EPOCH FROM (
          CASE WHEN status IN ('shipped','delivered') THEN updated_at ELSE NULL END
        ) - created_at) / 3600) AS avg_time_to_ship,
        COUNT(*) FILTER (WHERE status = 'in_production') AS backlog
      FROM "${schema}".orders
      WHERE created_at >= $1::date AND created_at < $2::date
    `, from, to);

    const r = rows[0] ?? {};
    return {
      averageTimeToShip: parseFloat(r.avg_time_to_ship ?? '0'),
      averageTimeToDeliver: 0, // Requires shipment delivery timestamp
      onTimeDeliveryRate: 95, // Placeholder — needs delivery SLA config
      productionBacklog: parseInt(r.backlog ?? '0'),
    };
  }

  private async getAiMetrics(schema: string, from: string, to: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total_messages,
        COUNT(*) FILTER (WHERE ai_processed = true) AS ai_handled,
        COUNT(*) FILTER (WHERE ai_processed = false AND direction = 'outbound') AS human_handled
      FROM "${schema}".messages
      WHERE created_at >= $1::date AND created_at < $2::date
    `, from, to);

    const r = rows[0] ?? {};
    const total = parseInt(r.total_messages ?? '0');
    const aiHandled = parseInt(r.ai_handled ?? '0');
    const humanEscalated = parseInt(r.human_handled ?? '0');

    return {
      totalMessages: total,
      aiHandled,
      humanEscalated,
      automationRate: total > 0 ? Math.round((aiHandled / total) * 100) : 0,
      averageResponseTime: 0, // Requires response timestamp tracking
      toolCallsExecuted: 0, // Requires tool call logging
      memoryUpdates: 0, // Requires memory update logging
    };
  }

  private async getProductMetrics(schema: string, from: string, to: string) {
    // Top selling products
    const topSelling = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.name,
             SUM((item->>'quantity')::int) AS quantity,
             SUM((item->>'quantity')::int * p.price) AS revenue
      FROM "${schema}".orders o,
           jsonb_array_elements(o.items) AS item
      JOIN "${schema}".products p ON p.id = (item->>'productId')::uuid
      WHERE o.created_at >= $1::date AND o.created_at < $2::date
        AND o.status != 'cancelled'
      GROUP BY p.name
      ORDER BY quantity DESC
      LIMIT 10
    `, from, to).catch(() => []);

    // Low stock
    const lowStock = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.name, p.sku, i.stock_available AS stock, i.stock_minimum AS minimum
      FROM "${schema}".products p
      JOIN "${schema}".inventory i ON i.product_id = p.id
      WHERE i.stock_available < i.stock_minimum AND p.is_active = true
      ORDER BY i.stock_available ASC
      LIMIT 10
    `);

    const outOfStock = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) AS count
      FROM "${schema}".products p
      JOIN "${schema}".inventory i ON i.product_id = p.id
      WHERE i.stock_available = 0 AND p.is_active = true
    `);

    return {
      topSelling: topSelling.map(r => ({
        name: r.name,
        quantity: parseInt(r.quantity ?? '0'),
        revenue: parseFloat(r.revenue ?? '0'),
      })),
      lowStock: lowStock.map(r => ({
        name: r.name,
        sku: r.sku ?? '',
        stock: r.stock,
        minimum: r.minimum,
      })),
      outOfStock: parseInt(outOfStock[0]?.count ?? '0'),
    };
  }

  private async getChannelMetrics(schema: string, from: string, to: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        o.channel_type,
        COUNT(*) AS orders,
        COALESCE(SUM(o.total), 0) AS revenue
      FROM "${schema}".orders o
      WHERE o.created_at >= $1::date AND o.created_at < $2::date
        AND o.status != 'cancelled'
      GROUP BY o.channel_type
    `, from, to);

    const msgRows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT c.channel_type, COUNT(m.*) AS messages
      FROM "${schema}".conversations c
      JOIN "${schema}".messages m ON m.conversation_id = c.id
      WHERE m.created_at >= $1::date AND m.created_at < $2::date
      GROUP BY c.channel_type
    `, from, to);

    const byChannel: Record<string, { messages: number; orders: number; revenue: number }> = {};
    for (const r of rows) {
      byChannel[r.channel_type] = {
        messages: 0,
        orders: parseInt(r.orders ?? '0'),
        revenue: parseFloat(r.revenue ?? '0'),
      };
    }
    for (const r of msgRows) {
      if (!byChannel[r.channel_type]) byChannel[r.channel_type] = { messages: 0, orders: 0, revenue: 0 };
      byChannel[r.channel_type].messages = parseInt(r.messages ?? '0');
    }

    return { byChannel };
  }
}
