import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma.service';
import { LoyaltyService } from './loyalty.service';

/**
 * Retention Cron Gateway — Daily re-engagement job scheduler.
 *
 * Cron: "0 9 * * *" (9:00 AM daily — best time for WhatsApp open rates)
 * Queue: loyalty-retention
 *
 * For each active tenant:
 * 1. Segments customers
 * 2. Identifies at-risk / churned
 * 3. Enqueues personalized re-engagement messages
 *
 * Rate limiting: max 5 re-engagement messages per tenant per day
 * to avoid spamming and maintain WhatsApp quality score.
 */
@Injectable()
export class RetentionCronGateway {
  private readonly logger = new Logger(RetentionCronGateway.name);
  private readonly MAX_MESSAGES_PER_DAY = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyaltyService: LoyaltyService,
    @InjectQueue('loyalty-retention') private readonly retentionQueue: Queue,
  ) {}

  /**
   * Daily retention scan — 9:00 AM.
   * Identifies re-engagement opportunities and queues messages.
   */
  @Cron('0 9 * * *', { name: 'daily-retention' })
  async scheduleDailyRetention(): Promise<void> {
    this.logger.log('💜 Retention cron: scanning for re-engagement opportunities...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, schemaName: true, slug: true },
    });

    let totalEnqueued = 0;

    for (const tenant of tenants) {
      try {
        const enqueued = await this.processRetentionForTenant(tenant);
        totalEnqueued += enqueued;
      } catch (err: any) {
        this.logger.error(`Retention failed for ${tenant.slug}: ${err.message}`);
      }
    }

    this.logger.log(`💜 Retention cron: ${totalEnqueued} messages enqueued across ${tenants.length} tenants`);
  }

  private async processRetentionForTenant(tenant: { id: string; schemaName: string; slug: string }): Promise<number> {
    // Check if re-engagement is enabled for this tenant
    const config = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT agent_config->'retention' AS retention
      FROM "${tenant.schemaName}".ai_config LIMIT 1
    `).catch(() => []);

    if (config[0]?.retention?.enabled === false) return 0;

    // Get targets
    const targets = await this.loyaltyService.getReEngagementTargets(tenant.schemaName);
    if (targets.length === 0) return 0;

    // Rate limit: max N messages per day
    const toSend = targets.slice(0, this.MAX_MESSAGES_PER_DAY);

    for (const target of toSend) {
      await this.retentionQueue.add('send-re-engagement', {
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        slug: tenant.slug,
        customerId: target.id,
        customerName: target.name,
        channelType: target.channelType,
        channelId: target.channelId,
        action: target.action,
        templateName: target.templateName,
        message: target.message,
        segment: target.segment,
        daysSinceLastOrder: target.daysSinceLastOrder,
      }, {
        jobId: `retention-${tenant.slug}-${target.id}-${new Date().toISOString().split('T')[0]}`,
        attempts: 2,
        backoff: { type: 'fixed', delay: 60000 },
      });
    }

    if (toSend.length > 0) {
      this.logger.log(`[${tenant.slug}] ${toSend.length} re-engagement messages queued (${targets.length} total opportunities)`);
    }

    return toSend.length;
  }
}
