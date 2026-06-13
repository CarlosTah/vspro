import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../database/prisma.service';

/**
 * Analytics Worker Processor — Generates daily reports and dispatches notifications.
 *
 * Queue: analytics-cron
 * Jobs:
 * - generate-daily-report: Compute aggregations for a tenant
 * - send-owner-report: Push formatted report via WhatsApp
 *
 * Isolation: validates tenantId ↔ schemaName before processing.
 */
@Processor('analytics-cron')
export class AnalyticsProcessor {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('generate-daily-report')
  async handleDailyReport(job: Job<any>): Promise<void> {
    const { tenantId, schemaName, slug, date } = job.data;

    // Tenant isolation validation
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.schemaName !== schemaName) {
      this.logger.error(`Tenant isolation violation in analytics: ${tenantId}`);
      return;
    }

    this.logger.log(`[${slug}] Generating daily report for ${date}...`);

    const nextDate = new Date(new Date(date).getTime() + 86400000).toISOString().split('T')[0];

    // Sales aggregation
    const sales = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS orders,
        COALESCE(SUM(total) FILTER (WHERE status != 'cancelled'), 0) AS revenue,
        COUNT(DISTINCT customer_id) AS customers
      FROM "${schemaName}".orders
      WHERE created_at >= $1::date AND created_at < $2::date
    `, date, nextDate);

    // Top products (JSONB items parser)
    const products = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT item->>'productName' AS name,
             SUM((item->>'quantity')::int) AS qty,
             SUM((item->>'unitPrice')::numeric * (item->>'quantity')::int) AS rev
      FROM "${schemaName}".orders o, jsonb_array_elements(o.items) AS item
      WHERE o.created_at >= $1::date AND o.created_at < $2::date AND o.status != 'cancelled'
      GROUP BY name ORDER BY rev DESC LIMIT 5
    `, date, nextDate).catch(() => []);

    // Inventory alerts
    const lowStock = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) AS c FROM "${schemaName}".inventory WHERE stock_available < stock_minimum
    `).catch(() => [{ c: '0' }]);

    const s = sales[0] ?? {};
    const reportSummary = {
      date,
      orders: parseInt(s.orders ?? '0'),
      revenue: parseFloat(s.revenue ?? '0'),
      customers: parseInt(s.customers ?? '0'),
      topProducts: products.map(p => `${p.name} (${p.qty})`).join(', '),
      lowStockCount: parseInt(lowStock[0]?.c ?? '0'),
    };

    this.logger.log(`[${slug}] Report: ${reportSummary.orders} orders, $${reportSummary.revenue.toLocaleString()}, ${reportSummary.customers} customers`);
  }

  @Process('send-owner-report')
  async handleSendReport(job: Job<any>): Promise<void> {
    const { tenantId, schemaName, ownerPhone, message } = job.data;

    // Validate tenant
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.schemaName !== schemaName) return;

    // In production: send via MessagingFactory
    // For now: log the report
    this.logger.log(`[${tenant.slug}] Owner report → ${ownerPhone}: ${message.slice(0, 80)}...`);
  }
}
