import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../database/prisma.service';

/**
 * Central cron scheduler for the worker process.
 * Manages all recurring background tasks with tenant isolation.
 */
@Injectable()
export class CronSchedulerService {
  private readonly logger = new Logger(CronSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('proactive-outreach') private readonly outreachQueue: Queue,
  ) {}

  // ─── Proactive Follow-up Scanner (every 60s) ──────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async scanProactiveFollowUps(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, schemaName: true, slug: true },
    });

    let totalEnqueued = 0;

    for (const tenant of tenants) {
      try {
        const due = await this.prisma.$queryRawUnsafe<any[]>(`
          UPDATE "${tenant.schemaName}".conversations
          SET next_follow_up_at = NULL
          WHERE next_follow_up_at <= NOW() AND status = 'active' AND next_follow_up_at IS NOT NULL
          RETURNING id, customer_id AS "customerId", channel_type AS "channelType"
        `);

        for (const conv of due) {
          await this.outreachQueue.add('process-outreach', {
            tenantId: tenant.id,
            schemaName: tenant.schemaName,
            conversationId: conv.id,
            customerId: conv.customerId,
            channelType: conv.channelType,
            scheduledAt: new Date().toISOString(),
          });
          totalEnqueued++;
        }
      } catch (err: any) {
        this.logger.error(`Proactive scan failed for ${tenant.slug}: ${err.message}`);
      }
    }

    if (totalEnqueued > 0) {
      this.logger.log(`Proactive scan: ${totalEnqueued} jobs enqueued`);
    }
  }

  // ─── Inventory Low-Stock Scanner (every 6 hours) ──────────────

  @Cron('0 */6 * * *')
  async scanInventoryLevels(): Promise<void> {
    this.logger.log('🔍 Inventory scan starting...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, schemaName: true, slug: true, businessName: true },
    });

    for (const tenant of tenants) {
      try {
        const lowStock = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT p.name, p.sku, i.stock_available, i.stock_minimum
          FROM "${tenant.schemaName}".products p
          JOIN "${tenant.schemaName}".inventory i ON i.product_id = p.id
          WHERE i.stock_available < i.stock_minimum AND p.is_active = true
        `);

        if (lowStock.length > 0) {
          this.logger.warn(
            `[${tenant.slug}] ${lowStock.length} products below stock minimum: ${lowStock.map(i => i.sku).join(', ')}`,
          );
        }
      } catch (err: any) {
        this.logger.error(`Inventory scan failed for ${tenant.slug}: ${err.message}`);
      }
    }

    this.logger.log('✅ Inventory scan complete');
  }

  // ─── Finance Daily Reconciliation (6:00 AM) ───────────────────

  @Cron('0 6 * * *')
  async dailyFinanceReconciliation(): Promise<void> {
    this.logger.log('💰 Daily finance reconciliation starting...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { schemaName: true, slug: true },
    });

    for (const tenant of tenants) {
      try {
        const stale = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT COUNT(*) AS count FROM "${tenant.schemaName}".payments
          WHERE status = 'verified' AND created_at < NOW() - INTERVAL '24 hours'
        `);

        const count = parseInt(stale[0]?.count ?? '0');
        if (count > 0) {
          this.logger.warn(`[${tenant.slug}] ${count} unreconciled payments older than 24h`);
        }
      } catch (err: any) {
        this.logger.error(`Finance reconciliation failed for ${tenant.slug}: ${err.message}`);
      }
    }

    this.logger.log('✅ Finance reconciliation complete');
  }
}
