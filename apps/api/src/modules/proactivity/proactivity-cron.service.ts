import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma.service';

export interface ProactiveOutreachJob {
  tenantId: string;
  schemaName: string;
  conversationId: string;
  customerId: string;
  channelType: string;
  scheduledAt: string;
}

/**
 * Cron job that scans all tenant schemas for due follow-ups
 * and enqueues them as BullMQ jobs for the ProactivityWorker.
 *
 * Runs every 60 seconds. Each tenant is processed independently
 * so a failure in one does not block others.
 */
@Injectable()
export class ProactivityCronService {
  private readonly logger = new Logger(ProactivityCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('proactive-outreach') private readonly outreachQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async scanDueFollowUps(): Promise<void> {
    // 1. Get all active tenants from public schema
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, schemaName: true, slug: true },
    });

    let totalEnqueued = 0;

    // 2. Process each tenant independently
    for (const tenant of tenants) {
      try {
        const enqueued = await this.scanTenant(tenant);
        totalEnqueued += enqueued;
      } catch (err: any) {
        // Failure in one tenant does not block others
        this.logger.error(
          `Error scanning tenant ${tenant.slug}: ${err.message}`,
        );
      }
    }

    if (totalEnqueued > 0) {
      this.logger.log(`Proactive scan: ${totalEnqueued} jobs enqueued across ${tenants.length} tenants`);
    }
  }

  private async scanTenant(tenant: { id: string; schemaName: string }): Promise<number> {
    // Atomically fetch and null-out due follow-ups to prevent duplicate jobs
    const dueConversations = await this.prisma.$queryRawUnsafe<any[]>(`
      UPDATE "${tenant.schemaName}".conversations
      SET next_follow_up_at = NULL
      WHERE next_follow_up_at <= NOW()
        AND status = 'active'
        AND next_follow_up_at IS NOT NULL
      RETURNING id, customer_id AS "customerId", channel_type AS "channelType",
                next_follow_up_at AS "scheduledAt"
    `);

    // Enqueue each as a BullMQ job
    for (const conv of dueConversations) {
      const jobData: ProactiveOutreachJob = {
        tenantId: tenant.id,
        schemaName: tenant.schemaName,
        conversationId: conv.id,
        customerId: conv.customerId,
        channelType: conv.channelType,
        scheduledAt: conv.scheduledAt?.toISOString?.() ?? new Date().toISOString(),
      };

      await this.outreachQueue.add('process-outreach', jobData, {
        jobId: `proactive-${tenant.id}-${conv.id}-${Date.now()}`,
      });
    }

    return dueConversations.length;
  }
}
