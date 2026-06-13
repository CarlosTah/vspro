import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma.service';
import { AnalyticsReportsService, DailyReport } from './analytics-reports.service';

/**
 * Analytics Notification Dispatcher — WhatsApp push of daily reports to owners.
 *
 * After the daily report is generated, this dispatcher:
 * 1. Formats the report as a WhatsApp message
 * 2. Gets the owner's phone from tenant settings
 * 3. Enqueues the message for delivery via MessagingFactory
 *
 * Feature: whatsapp-push
 */
@Injectable()
export class AnalyticsNotificationDispatcher {
  private readonly logger = new Logger(AnalyticsNotificationDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: AnalyticsReportsService,
    @InjectQueue('analytics-cron') private readonly queue: Queue,
  ) {}

  /**
   * Generate report + send to owner via WhatsApp.
   * Called by the worker after processing the analytics-cron job.
   */
  async generateAndNotify(job: {
    tenantId: string;
    schemaName: string;
    slug: string;
    date: string;
  }): Promise<{ report: DailyReport; notified: boolean }> {
    // 1. Generate the report
    const report = await this.reportsService.generateDailyReport(job.schemaName, job.date);

    // 2. Get owner phone
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: job.tenantId },
      select: { settings: true },
    });

    const settings = tenant?.settings as Record<string, any> | null;
    const ownerPhone = settings?.ownerPhone;

    if (!ownerPhone) {
      this.logger.debug(`[${job.slug}] No owner phone — report generated but not pushed`);
      return { report, notified: false };
    }

    // 3. Check if notifications enabled
    const prefs = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT agent_config->'notifications'->'daily_summary' AS enabled
      FROM "${job.schemaName}".ai_config LIMIT 1
    `).catch(() => []);

    if (prefs[0]?.enabled === false) {
      this.logger.debug(`[${job.slug}] Daily summary disabled — skipping push`);
      return { report, notified: false };
    }

    // 4. Only send if there was activity
    if (report.sales.totalOrders === 0 && report.funnel.conversations === 0) {
      this.logger.debug(`[${job.slug}] No activity today — skipping push`);
      return { report, notified: false };
    }

    // 5. Format and enqueue WhatsApp message
    const message = this.reportsService.formatAsWhatsAppMessage(report);

    // Get channel config for sending
    const channels = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT type FROM "${job.schemaName}".channels WHERE is_active = true AND type = 'whatsapp' LIMIT 1
    `).catch(() => []);

    const channelType = channels[0]?.type ?? 'whatsapp';

    // Enqueue for delivery
    await this.queue.add('send-owner-report', {
      tenantId: job.tenantId,
      schemaName: job.schemaName,
      ownerPhone,
      channelType,
      message,
      reportDate: job.date,
    }, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 60000 },
    });

    this.logger.log(`[${job.slug}] Daily report sent to owner (${ownerPhone})`);
    return { report, notified: true };
  }
}
