import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Purchase History Analysis Service.
 * Analyzes buying patterns, frequency, and lifetime value.
 * Used by SalesAgent for upsell suggestions and by the dashboard.
 */
@Injectable()
export class PurchaseHistoryService {
  private readonly logger = new Logger(PurchaseHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get complete purchase analysis for a customer.
   */
  async getAnalysis(customerId: string, schemaName: string): Promise<PurchaseAnalysis> {
    const [summary, frequency, recentOrders] = await Promise.all([
      this.getSummary(customerId, schemaName),
      this.getFrequency(customerId, schemaName),
      this.getRecentOrders(customerId, schemaName),
    ]);

    return { customerId, ...summary, frequency, recentOrders };
  }

  private async getSummary(customerId: string, schema: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(total), 0) AS lifetime_value,
        COALESCE(AVG(total), 0) AS avg_order_value,
        MAX(created_at) AS last_order_date,
        MIN(created_at) AS first_order_date
      FROM "${schema}".orders
      WHERE customer_id = $1::uuid AND status NOT IN ('cancelled')
    `, customerId);

    const r = rows[0] ?? {};
    return {
      totalOrders: parseInt(r.total_orders ?? '0'),
      lifetimeValue: parseFloat(r.lifetime_value ?? '0'),
      averageOrderValue: parseFloat(r.avg_order_value ?? '0'),
      lastOrderDate: r.last_order_date,
      firstOrderDate: r.first_order_date,
    };
  }

  private async getFrequency(customerId: string, schema: string): Promise<PurchaseFrequency> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT created_at FROM "${schema}".orders
      WHERE customer_id = $1::uuid AND status NOT IN ('cancelled')
      ORDER BY created_at ASC
    `, customerId);

    if (rows.length < 2) return { avgDaysBetween: null, isRecurring: false, segment: 'new' };

    const dates = rows.map(r => new Date(r.created_at).getTime());
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((dates[i] - dates[i - 1]) / 86400000);
    }

    const avgDays = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const daysSinceLast = (Date.now() - dates[dates.length - 1]) / 86400000;

    let segment: CustomerSegment = 'active';
    if (daysSinceLast > avgDays * 3) segment = 'at_risk';
    if (daysSinceLast > 90) segment = 'churned';
    if (rows.length >= 5 && avgDays < 30) segment = 'vip';

    return {
      avgDaysBetween: Math.round(avgDays),
      isRecurring: rows.length >= 3 && avgDays < 60,
      segment,
    };
  }

  private async getRecentOrders(customerId: string, schema: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, order_number, status, total, created_at
      FROM "${schema}".orders
      WHERE customer_id = $1::uuid
      ORDER BY created_at DESC LIMIT 5
    `, customerId);
  }
}

// ─── Types ──────────────────────────────────────────────────────

type CustomerSegment = 'new' | 'active' | 'vip' | 'at_risk' | 'churned';

interface PurchaseFrequency {
  avgDaysBetween: number | null;
  isRecurring: boolean;
  segment: CustomerSegment;
}

interface PurchaseAnalysis {
  customerId: string;
  totalOrders: number;
  lifetimeValue: number;
  averageOrderValue: number;
  lastOrderDate: Date | null;
  firstOrderDate: Date | null;
  frequency: PurchaseFrequency;
  recentOrders: any[];
}
