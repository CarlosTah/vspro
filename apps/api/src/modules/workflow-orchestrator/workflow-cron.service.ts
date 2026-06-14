import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma.service';
import { WorkflowEventBus } from './workflow-event-bus.service';

/**
 * Workflow Cron Service — Periodic triggers for orchestrated workflows.
 *
 * Responsibilities:
 * - Scan for campaigns due for execution (every minute)
 * - Detect customers becoming inactive (daily)
 * - Clean up completed workflow instances (weekly)
 */
@Injectable()
export class WorkflowCronService {
  private readonly logger = new Logger(WorkflowCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: WorkflowEventBus,
    @InjectQueue('workflow-orchestrator') private readonly workflowQueue: Queue,
  ) {}

  /**
   * Campaign Scheduler — Scans for active campaigns due for execution.
   * Runs every minute, checks cron expressions against last_run.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async scanCampaignSchedules(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, schemaName: true, slug: true },
    });

    for (const tenant of tenants) {
      try {
        await this.scanTenantCampaigns(tenant);
      } catch (err: any) {
        this.logger.error(`Campaign scan failed for ${tenant.slug}: ${err.message}`);
      }
    }
  }

  /**
   * Inactivity Detector — Identifies customers who became inactive.
   * Runs daily at 7:00 AM.
   */
  @Cron('0 7 * * *')
  async detectInactiveCustomers(): Promise<void> {
    this.logger.log('🔍 Scanning for inactive customers...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, schemaName: true, slug: true },
    });

    let totalDetected = 0;

    for (const tenant of tenants) {
      try {
        const inactive = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT c.id, c.name,
                 MAX(o.created_at) AS last_order,
                 EXTRACT(DAY FROM NOW() - MAX(o.created_at)) AS days_inactive
          FROM "${tenant.schemaName}".customers c
          LEFT JOIN "${tenant.schemaName}".orders o ON o.customer_id = c.id AND o.status != 'cancelled'
          GROUP BY c.id, c.name
          HAVING MAX(o.created_at) < NOW() - INTERVAL '30 days'
             AND MAX(o.created_at) > NOW() - INTERVAL '31 days'
        `);

        for (const customer of inactive) {
          await this.eventBus.emit(
            'customer.became_inactive',
            tenant.id,
            tenant.schemaName,
            {
              customerId: customer.id,
              customerName: customer.name,
              daysInactive: Math.round(parseFloat(customer.days_inactive)),
              reason: 'no_orders_30d',
            },
            { source: 'system', customerId: customer.id },
          );
          totalDetected++;
        }
      } catch (err: any) {
        this.logger.error(`Inactivity scan failed for ${tenant.slug}: ${err.message}`);
      }
    }

    if (totalDetected > 0) {
      this.logger.log(`🔍 Detected ${totalDetected} newly inactive customers`);
    }
  }

  /**
   * Workflow Cleanup — Removes completed instances older than 30 days.
   * Runs weekly on Sunday at 3:00 AM.
   */
  @Cron('0 3 * * 0')
  async cleanupOldWorkflows(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { schemaName: true, slug: true },
    });

    for (const tenant of tenants) {
      try {
        await this.prisma.$executeRawUnsafe(`
          DELETE FROM "${tenant.schemaName}".workflow_instances
          WHERE status IN ('completed', 'failed', 'cancelled')
            AND started_at < NOW() - INTERVAL '30 days'
        `);

        await this.prisma.$executeRawUnsafe(`
          DELETE FROM "${tenant.schemaName}".workflow_events
          WHERE created_at < NOW() - INTERVAL '30 days'
        `);
      } catch {
        // Table might not exist yet for this tenant — skip silently
      }
    }
  }

  // ─── Campaign Scanning ────────────────────────────────────────

  private async scanTenantCampaigns(tenant: { id: string; schemaName: string }): Promise<void> {
    // Check if retention_campaigns table exists
    const tableExists = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = 'retention_campaigns'
    `, tenant.schemaName);

    if (tableExists.length === 0) return;

    // Find active campaigns with cron that are due
    const dueCampaigns = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, schedule_cron, last_run
      FROM "${tenant.schemaName}".retention_campaigns
      WHERE status = 'active' AND schedule_cron IS NOT NULL
    `);

    for (const campaign of dueCampaigns) {
      if (this.isCronDue(campaign.schedule_cron, campaign.last_run)) {
        await this.workflowQueue.add('workflow-event', {
          type: 'workflow-event',
          tenantId: tenant.id,
          schemaName: tenant.schemaName,
          event: {
            id: `cron-${campaign.id}-${Date.now()}`,
            type: 'campaign.activated',
            tenantId: tenant.id,
            schemaName: tenant.schemaName,
            payload: { campaignId: campaign.id, campaignName: campaign.name, trigger: 'cron' },
            metadata: { source: 'retention' },
            createdAt: new Date().toISOString(),
          },
        }, {
          jobId: `campaign-exec-${campaign.id}-${Date.now()}`,
        });
      }
    }
  }

  private isCronDue(cronExpression: string, lastRun: Date | null): boolean {
    if (!lastRun) return true; // Never ran → due now

    // Simple interval check: compare against last_run
    // For production: use a proper cron parser like 'cron-parser'
    const hoursSinceLastRun = (Date.now() - new Date(lastRun).getTime()) / 3600000;

    // Parse simple patterns
    if (cronExpression === '0 */6 * * *') return hoursSinceLastRun >= 6;
    if (cronExpression === '0 */12 * * *') return hoursSinceLastRun >= 12;
    if (cronExpression === '0 8 * * *') return hoursSinceLastRun >= 24;
    if (cronExpression === '0 0 * * 1') return hoursSinceLastRun >= 168; // weekly

    // Default: at least 1 hour between executions
    return hoursSinceLastRun >= 1;
  }
}
