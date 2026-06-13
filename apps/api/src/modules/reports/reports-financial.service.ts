import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { FinancialDashboard } from './dto/reports.dto';

/**
 * Financial Dashboard Reports.
 * Aggregates income, payments, accounting entries, and revenue trends.
 * Dependencies: PaymentsService, AccountingService
 */
@Injectable()
export class ReportsFinancialService {
  private readonly logger = new Logger(ReportsFinancialService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getFinancialDashboard(schemaName: string, from: string, to: string): Promise<FinancialDashboard> {
    const [income, payments, accounting, trends] = await Promise.all([
      this.getIncomeStats(schemaName, from, to),
      this.getPaymentStats(schemaName, from, to),
      this.getAccountingStats(schemaName, from, to),
      this.getDailyRevenueTrend(schemaName, from, to),
    ]);

    return { period: { from, to }, income, payments, accounting, trends };
  }

  private async getIncomeStats(schema: string, from: string, to: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COALESCE(SUM(amount), 0) AS gross,
        COALESCE(SUM(amount) FILTER (WHERE type = 'sale'), 0) AS net_sales,
        COALESCE(SUM(tax_amount), 0) AS tax,
        COALESCE(SUM(amount) FILTER (WHERE type = 'shipping'), 0) AS shipping,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE type = 'refund'), 0) AS refunds
      FROM "${schema}".accounting_entries
      WHERE created_at >= $1::date AND created_at < $2::date
    `, from, to);

    const r = rows[0] ?? {};
    const gross = parseFloat(r.gross ?? '0');
    const refunds = parseFloat(r.refunds ?? '0');
    return {
      grossRevenue: gross,
      netRevenue: gross - refunds,
      taxCollected: parseFloat(r.tax ?? '0'),
      shippingRevenue: parseFloat(r.shipping ?? '0'),
      refunds,
    };
  }

  private async getPaymentStats(schema: string, from: string, to: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'verified' OR status = 'reconciled') AS verified,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
      FROM "${schema}".payments
      WHERE created_at >= $1::date AND created_at < $2::date
    `, from, to);

    // By method breakdown
    const methods = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT method, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
      FROM "${schema}".payments
      WHERE created_at >= $1::date AND created_at < $2::date
      GROUP BY method
    `, from, to);

    const r = rows[0] ?? {};
    const byMethod: Record<string, { count: number; amount: number }> = {};
    for (const m of methods) {
      byMethod[m.method] = { count: parseInt(m.count), amount: parseFloat(m.amount) };
    }

    return {
      total: parseInt(r.total ?? '0'),
      verified: parseInt(r.verified ?? '0'),
      pending: parseInt(r.pending ?? '0'),
      rejected: parseInt(r.rejected ?? '0'),
      byMethod,
    };
  }

  private async getAccountingStats(schema: string, from: string, to: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(amount) FILTER (WHERE type = 'sale'), 0) AS sales,
        COALESCE(SUM(amount) FILTER (WHERE type = 'shipping'), 0) AS shipping,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE type = 'refund'), 0) AS refunds,
        COALESCE(SUM(amount) FILTER (WHERE type = 'adjustment'), 0) AS adjustments
      FROM "${schema}".accounting_entries
      WHERE created_at >= $1::date AND created_at < $2::date
    `, from, to);

    const r = rows[0] ?? {};
    return {
      totalEntries: parseInt(r.total ?? '0'),
      sales: parseFloat(r.sales ?? '0'),
      shipping: parseFloat(r.shipping ?? '0'),
      refunds: parseFloat(r.refunds ?? '0'),
      adjustments: parseFloat(r.adjustments ?? '0'),
    };
  }

  private async getDailyRevenueTrend(schema: string, from: string, to: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT DATE(created_at) AS date, COALESCE(SUM(total), 0) AS amount
      FROM "${schema}".orders
      WHERE created_at >= $1::date AND created_at < $2::date
        AND status NOT IN ('cancelled')
      GROUP BY DATE(created_at)
      ORDER BY date
    `, from, to);

    return {
      dailyRevenue: rows.map(r => ({
        date: r.date?.toISOString?.()?.split('T')[0] ?? r.date,
        amount: parseFloat(r.amount ?? '0'),
      })),
    };
  }
}
