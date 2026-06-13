import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BusinessSummary } from './dto/reports.dto';

/**
 * Business Summary Reports.
 * Aggregates orders, revenue, customers, and conversations
 * for the tenant dashboard overview.
 */
@Injectable()
export class ReportsSummaryService {
  private readonly logger = new Logger(ReportsSummaryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getBusinessSummary(schemaName: string, from: string, to: string): Promise<BusinessSummary> {
    const [orders, revenue, customers, conversations] = await Promise.all([
      this.getOrderStats(schemaName, from, to),
      this.getRevenueStats(schemaName, from, to),
      this.getCustomerStats(schemaName, from, to),
      this.getConversationStats(schemaName, from, to),
    ]);

    return {
      period: { from, to },
      orders,
      revenue,
      customers,
      conversations,
    };
  }

  private async getOrderStats(schema: string, from: string, to: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'new') AS new,
        COUNT(*) FILTER (WHERE status = 'in_production') AS in_production,
        COUNT(*) FILTER (WHERE status = 'shipped') AS shipped,
        COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
      FROM "${schema}".orders
      WHERE created_at >= $1::date AND created_at < $2::date
    `, from, to);

    const r = rows[0] ?? {};
    return {
      total: parseInt(r.total ?? '0'),
      new: parseInt(r.new ?? '0'),
      inProduction: parseInt(r.in_production ?? '0'),
      shipped: parseInt(r.shipped ?? '0'),
      delivered: parseInt(r.delivered ?? '0'),
      cancelled: parseInt(r.cancelled ?? '0'),
    };
  }

  private async getRevenueStats(schema: string, from: string, to: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COALESCE(SUM(total), 0) AS total_revenue,
        COALESCE(SUM(total) FILTER (WHERE status IN ('paid','in_production','ready','shipped','delivered')), 0) AS paid,
        COALESCE(SUM(total) FILTER (WHERE status = 'payment_pending'), 0) AS pending,
        COALESCE(AVG(total) FILTER (WHERE status != 'cancelled'), 0) AS avg_order
      FROM "${schema}".orders
      WHERE created_at >= $1::date AND created_at < $2::date
    `, from, to);

    const r = rows[0] ?? {};
    return {
      total: parseFloat(r.total_revenue ?? '0'),
      paid: parseFloat(r.paid ?? '0'),
      pending: parseFloat(r.pending ?? '0'),
      averageOrderValue: parseFloat(r.avg_order ?? '0'),
    };
  }

  private async getCustomerStats(schema: string, from: string, to: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        (SELECT COUNT(*) FROM "${schema}".customers) AS total,
        COUNT(*) FILTER (WHERE created_at >= $1::date AND created_at < $2::date) AS new_in_period
      FROM "${schema}".customers
    `, from, to);

    const r = rows[0] ?? {};
    const total = parseInt(r.total ?? '0');
    const newInPeriod = parseInt(r.new_in_period ?? '0');
    return { total, newInPeriod, returning: total - newInPeriod };
  }

  private async getConversationStats(schema: string, from: string, to: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved
      FROM "${schema}".conversations
      WHERE created_at >= $1::date AND created_at < $2::date
    `, from, to);

    const r = rows[0] ?? {};
    return {
      total: parseInt(r.total ?? '0'),
      active: parseInt(r.active ?? '0'),
      resolved: parseInt(r.resolved ?? '0'),
    };
  }
}
