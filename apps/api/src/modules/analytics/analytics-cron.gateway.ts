import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma.service';

/**
 * Analytics Cron Gateway — Schedules daily report generation for all tenants.
 *
 * Cron: "0 23 * * *" (11:00 PM daily)
 * Queue: analytics-cron
 * Isolation: schema-per-tenant (each tenant gets their own job)
 *
 * This gateway only schedules jobs — the actual aggregation runs
 * in the worker process via AnalyticsWorkerProcessor.
 */
@Injectable()
export class AnalyticsCronGateway {
  private readonly logger = new Logger(AnalyticsCronGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('analytics-cron') private readonly analyticsQueue: Queue,
  ) {}

  /**
   * Daily analytics cron — runs at 11:00 PM.
   * Enqueues a report generation job for each active tenant.
   */
  @Cron('0 23 * * *', { name: 'daily-analytics' })
  async scheduleDailyReports(): Promise<void> {
    this.logger.log('📊 Analytics cron: scheduling daily reports for all tenants...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, schemaName: true, slug: true, businessName: true },
    });

    let enqueued = 0;

    for (const tenant of tenants) {
      try {
        await this.analyticsQueue.add('generate-daily-report', {
          tenantId: tenant.id,
          schemaName: tenant.schemaName,
          slug: tenant.slug,
          businessName: tenant.businessName,
          date: new Date().toISOString().split('T')[0],
          timestamp: new Date().toISOString(),
        }, {
          jobId: `analytics-${tenant.slug}-${new Date().toISOString().split('T')[0]}`,
          attempts: 2,
          backoff: { type: 'fixed', delay: 30000 },
          removeOnComplete: 30, // Keep last 30 days
        });
        enqueued++;
      } catch (err: any) {
        this.logger.error(`Failed to enqueue analytics for ${tenant.slug}: ${err.message}`);
      }
    }

    this.logger.log(`📊 Analytics cron: ${enqueued}/${tenants.length} jobs enqueued`);
  }

  /**
   * Manual trigger — generate report for a specific tenant (admin action).
   */
  async triggerForTenant(tenantId: string, schemaName: string, slug: string): Promise<void> {
    await this.analyticsQueue.add('generate-daily-report', {
      tenantId,
      schemaName,
      slug,
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      manual: true,
    });
    this.logger.log(`Analytics manually triggered for ${slug}`);
  }
}
