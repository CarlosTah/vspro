import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InventoryAgent } from './inventory-agent';
import { FinanceAgent } from './finance-agent';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Registers and manages cron jobs for autonomous agents.
 * Each cron respects multi-tenant isolation by iterating tenants independently.
 *
 * Registered crons:
 * - InventoryAgent.scanAllTenants() — every 6 hours
 * - FinanceAgent.dailyReconciliation() — daily at 6:00 AM
 */
@Injectable()
export class AgentCronsService {
  private readonly logger = new Logger(AgentCronsService.name);

  constructor(
    private readonly inventoryAgent: InventoryAgent,
    private readonly financeAgent: FinanceAgent,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Inventory scan — every 6 hours.
   * Scans all active tenant schemas for products below stock_minimum.
   * Generates supplier email drafts for admin review.
   */
  @Cron('0 */6 * * *', { name: 'inventory-scan' })
  async inventoryScan(): Promise<void> {
    this.logger.log('🔍 InventoryAgent: Starting cross-tenant stock scan...');
    try {
      await this.inventoryAgent.scanAllTenants();
      this.logger.log('✅ InventoryAgent: Scan complete');
    } catch (err: any) {
      this.logger.error(`❌ InventoryAgent scan failed: ${err.message}`);
    }
  }

  /**
   * Finance reconciliation — daily at 6:00 AM.
   * Checks all active tenants for unreconciled payments older than 24h.
   */
  @Cron('0 6 * * *', { name: 'finance-daily-reconciliation' })
  async financeReconciliation(): Promise<void> {
    this.logger.log('💰 FinanceAgent: Starting daily reconciliation...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { schemaName: true, slug: true },
    });

    let processed = 0;
    for (const tenant of tenants) {
      try {
        await this.financeAgent.dailyReconciliation(tenant.schemaName);
        processed++;
      } catch (err: any) {
        this.logger.error(`FinanceAgent failed for ${tenant.slug}: ${err.message}`);
        // Continue with other tenants — isolation
      }
    }

    this.logger.log(`✅ FinanceAgent: Reconciliation complete (${processed}/${tenants.length} tenants)`);
  }
}
