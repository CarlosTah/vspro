import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Analytics Reports Service — Daily aggregation with JSONB items parsing.
 *
 * Features:
 * - daily-aggregation: Computes daily KPIs across orders, inventory, AI usage
 * - jsonb-items-parser: Parses orders.items JSONB to extract product-level metrics
 * - Schema-per-tenant isolation: all queries scoped to tenant schema
 *
 * Tables used: orders, inventory, ai_config
 */
@Injectable()
export class AnalyticsReportsService {
  private readonly logger = new Logger(AnalyticsReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate daily aggregation report for a tenant.
   * Parses JSONB items from orders to compute product-level metrics.
   */
  async generateDailyReport(schemaName: string, date?: string): Promise<DailyReport> {
    const targetDate = date ?? new Date().toISOString().split('T')[0];
    const nextDate = new Date(new Date(targetDate).getTime() + 86400000).toISOString().split('T')[0];

    const [sales, products, inventory, funnel] = await Promise.all([
      this.getDailySales(schemaName, targetDate, nextDate),
      this.getProductBreakdown(schemaName, targetDate, nextDate),
      this.getInventorySnapshot(schemaName),
      this.getConversionFunnel(schemaName, targetDate, nextDate),
    ]);

    return {
      date: targetDate,
      schemaName,
      generatedAt: new Date().toISOString(),
      sales,
      products,
      inventory,
      funnel,
    };
  }

  // ─── Daily Sales Aggregation ──────────────────────────────────

  private async getDailySales(schema: string, from: string, to: string): Promise<SalesMetrics> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (WHERE status NOT IN ('cancelled')) AS valid_orders,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
        COALESCE(SUM(total) FILTER (WHERE status NOT IN ('cancelled')), 0) AS revenue,
        COALESCE(AVG(total) FILTER (WHERE status NOT IN ('cancelled')), 0) AS avg_order_value,
        COALESCE(MAX(total), 0) AS max_order,
        COUNT(DISTINCT customer_id) AS unique_customers
      FROM "${schema}".orders
      WHERE created_at >= $1::date AND created_at < $2::date
    `, from, to);

    const r = rows[0] ?? {};
    return {
      totalOrders: parseInt(r.total_orders ?? '0'),
      validOrders: parseInt(r.valid_orders ?? '0'),
      cancelled: parseInt(r.cancelled ?? '0'),
      delivered: parseInt(r.delivered ?? '0'),
      revenue: parseFloat(r.revenue ?? '0'),
      avgOrderValue: parseFloat(r.avg_order_value ?? '0'),
      maxOrder: parseFloat(r.max_order ?? '0'),
      uniqueCustomers: parseInt(r.unique_customers ?? '0'),
    };
  }

  // ─── JSONB Items Parser — Product-level breakdown ─────────────

  private async getProductBreakdown(schema: string, from: string, to: string): Promise<ProductMetric[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        item->>'productName' AS product_name,
        item->>'productId' AS product_id,
        SUM((item->>'quantity')::int) AS total_quantity,
        SUM((item->>'unitPrice')::numeric * (item->>'quantity')::int) AS total_revenue,
        COUNT(DISTINCT o.id) AS order_count
      FROM "${schema}".orders o,
           jsonb_array_elements(o.items) AS item
      WHERE o.created_at >= $1::date AND o.created_at < $2::date
        AND o.status NOT IN ('cancelled')
      GROUP BY item->>'productName', item->>'productId'
      ORDER BY total_revenue DESC
      LIMIT 20
    `, from, to);

    return rows.map(r => ({
      productId: r.product_id,
      productName: r.product_name ?? 'Unknown',
      totalQuantity: parseInt(r.total_quantity ?? '0'),
      totalRevenue: parseFloat(r.total_revenue ?? '0'),
      orderCount: parseInt(r.order_count ?? '0'),
    }));
  }

  // ─── Inventory Snapshot ───────────────────────────────────────

  private async getInventorySnapshot(schema: string): Promise<InventoryMetrics> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total_products,
        COUNT(*) FILTER (WHERE i.stock_available = 0) AS out_of_stock,
        COUNT(*) FILTER (WHERE i.stock_available < i.stock_minimum) AS below_minimum,
        COALESCE(SUM(i.stock_available), 0) AS total_units,
        COALESCE(SUM(i.stock_reserved), 0) AS total_reserved
      FROM "${schema}".products p
      JOIN "${schema}".inventory i ON i.product_id = p.id
      WHERE p.is_active = true
    `);

    const r = rows[0] ?? {};
    return {
      totalProducts: parseInt(r.total_products ?? '0'),
      outOfStock: parseInt(r.out_of_stock ?? '0'),
      belowMinimum: parseInt(r.below_minimum ?? '0'),
      totalUnits: parseInt(r.total_units ?? '0'),
      totalReserved: parseInt(r.total_reserved ?? '0'),
    };
  }

  // ─── Conversion Funnel ────────────────────────────────────────

  private async getConversionFunnel(schema: string, from: string, to: string): Promise<FunnelMetrics> {
    const conversations = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) AS c FROM "${schema}".conversations
      WHERE created_at >= $1::date AND created_at < $2::date
    `, from, to);

    const orders = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) AS c FROM "${schema}".orders
      WHERE created_at >= $1::date AND created_at < $2::date
    `, from, to);

    const paid = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) AS c FROM "${schema}".orders
      WHERE created_at >= $1::date AND created_at < $2::date
        AND status IN ('paid','in_production','ready','shipped','delivered')
    `, from, to);

    const totalConvs = parseInt(conversations[0]?.c ?? '0');
    const totalOrders = parseInt(orders[0]?.c ?? '0');
    const totalPaid = parseInt(paid[0]?.c ?? '0');

    return {
      conversations: totalConvs,
      ordersCreated: totalOrders,
      ordersPaid: totalPaid,
      convToOrderRate: totalConvs > 0 ? Math.round((totalOrders / totalConvs) * 100) : 0,
      orderToPayRate: totalOrders > 0 ? Math.round((totalPaid / totalOrders) * 100) : 0,
    };
  }

  /**
   * Format report as WhatsApp message for the owner.
   */
  formatAsWhatsAppMessage(report: DailyReport): string {
    let msg = `📊 *Reporte diario — ${report.date}*\n\n`;

    msg += `💰 *Ventas*\n`;
    msg += `  Pedidos: ${report.sales.validOrders} (${report.sales.cancelled} cancelados)\n`;
    msg += `  Ingresos: $${report.sales.revenue.toLocaleString()}\n`;
    msg += `  Ticket promedio: $${report.sales.avgOrderValue.toFixed(0)}\n`;
    msg += `  Clientes únicos: ${report.sales.uniqueCustomers}\n\n`;

    if (report.products.length > 0) {
      msg += `🏆 *Top productos*\n`;
      for (const p of report.products.slice(0, 5)) {
        msg += `  • ${p.productName}: ${p.totalQuantity} uds — $${p.totalRevenue.toLocaleString()}\n`;
      }
      msg += '\n';
    }

    msg += `📦 *Inventario*\n`;
    msg += `  En stock: ${report.inventory.totalUnits} unidades\n`;
    if (report.inventory.outOfStock > 0) msg += `  ⚠️ Agotados: ${report.inventory.outOfStock}\n`;
    if (report.inventory.belowMinimum > 0) msg += `  ⚠️ Bajo mínimo: ${report.inventory.belowMinimum}\n`;
    msg += '\n';

    msg += `📈 *Embudo*\n`;
    msg += `  Conversaciones → Pedidos: ${report.funnel.convToOrderRate}%\n`;
    msg += `  Pedidos → Pagados: ${report.funnel.orderToPayRate}%\n`;

    return msg;
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface DailyReport {
  date: string;
  schemaName: string;
  generatedAt: string;
  sales: SalesMetrics;
  products: ProductMetric[];
  inventory: InventoryMetrics;
  funnel: FunnelMetrics;
}

interface SalesMetrics {
  totalOrders: number;
  validOrders: number;
  cancelled: number;
  delivered: number;
  revenue: number;
  avgOrderValue: number;
  maxOrder: number;
  uniqueCustomers: number;
}

interface ProductMetric {
  productId: string;
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
}

interface InventoryMetrics {
  totalProducts: number;
  outOfStock: number;
  belowMinimum: number;
  totalUnits: number;
  totalReserved: number;
}

interface FunnelMetrics {
  conversations: number;
  ordersCreated: number;
  ordersPaid: number;
  convToOrderRate: number;
  orderToPayRate: number;
}
