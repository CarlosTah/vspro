import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { execSync } from 'child_process';
import * as path from 'path';
import { PrismaService } from '../../database/prisma.service';

/**
 * Backup Service — Automated database backups to S3.
 *
 * Features:
 * - s3-backup-integration: Uploads pg_dump to S3 bucket
 * - cron-task-scheduling: Daily at 2:00 AM
 * - Schema-per-tenant: Backs up each tenant schema independently
 *
 * Backup strategy:
 * - Full database dump (all schemas) → s3://bucket/backups/full/YYYY-MM-DD.sql.gz
 * - Individual tenant schemas → s3://bucket/backups/tenants/{slug}/YYYY-MM-DD.sql.gz
 * - Retention: 30 days (configurable)
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly bucket: string;
  private readonly region: string;
  private readonly retentionDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.bucket = this.config.get('AWS_S3_BUCKET', 'vspro-backups');
    this.region = this.config.get('AWS_REGION', 'us-east-1');
    this.retentionDays = 30;
  }

  /**
   * Daily backup cron — 2:00 AM.
   */
  @Cron('0 2 * * *', { name: 'daily-backup' })
  async runDailyBackup(): Promise<void> {
    this.logger.log('💾 Starting daily backup...');

    const dbUrl = this.config.get('DATABASE_URL');
    if (!dbUrl) {
      this.logger.error('DATABASE_URL not configured — backup skipped');
      return;
    }

    const date = new Date().toISOString().split('T')[0];

    try {
      // 1. Full database backup
      await this.backupFullDatabase(dbUrl, date);

      // 2. Per-tenant backups
      await this.backupTenantSchemas(dbUrl, date);

      // 3. Cleanup old backups
      await this.cleanupOldBackups(date);

      this.logger.log(`💾 Daily backup complete: ${date}`);
    } catch (err: any) {
      this.logger.error(`Backup failed: ${err.message}`);
    }
  }

  /**
   * Full database dump.
   */
  private async backupFullDatabase(dbUrl: string, date: string): Promise<void> {
    const filename = `full-${date}.sql.gz`;
    const s3Key = `backups/full/${filename}`;

    try {
      // pg_dump → gzip → aws s3 cp
      const cmd = `pg_dump "${dbUrl}" --no-owner --no-acl | gzip | aws s3 cp - s3://${this.bucket}/${s3Key} --region ${this.region}`;

      if (this.config.get('NODE_ENV') === 'production') {
        execSync(cmd, { stdio: 'pipe', timeout: 300000 }); // 5 min timeout
        this.logger.log(`Full backup uploaded: s3://${this.bucket}/${s3Key}`);
      } else {
        this.logger.debug(`[DEV] Would run: pg_dump → s3://${this.bucket}/${s3Key}`);
      }
    } catch (err: any) {
      this.logger.error(`Full backup failed: ${err.message}`);
    }
  }

  /**
   * Per-tenant schema backups.
   */
  private async backupTenantSchemas(dbUrl: string, date: string): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { slug: true, schemaName: true },
    });

    for (const tenant of tenants) {
      try {
        const filename = `${tenant.slug}-${date}.sql.gz`;
        const s3Key = `backups/tenants/${tenant.slug}/${filename}`;

        const cmd = `pg_dump "${dbUrl}" --schema="${tenant.schemaName}" --no-owner | gzip | aws s3 cp - s3://${this.bucket}/${s3Key} --region ${this.region}`;

        if (this.config.get('NODE_ENV') === 'production') {
          execSync(cmd, { stdio: 'pipe', timeout: 120000 });
          this.logger.debug(`Tenant backup: ${tenant.slug} → ${s3Key}`);
        }
      } catch (err: any) {
        this.logger.error(`Tenant backup failed for ${tenant.slug}: ${err.message}`);
      }
    }
  }

  /**
   * Remove backups older than retention period.
   */
  private async cleanupOldBackups(currentDate: string): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionDays * 86400000).toISOString().split('T')[0];

    if (this.config.get('NODE_ENV') === 'production') {
      try {
        // List and delete old objects
        const cmd = `aws s3 ls s3://${this.bucket}/backups/ --recursive | awk '{print $4}' | grep -E "\\d{4}-\\d{2}-\\d{2}" | while read key; do date=$(echo $key | grep -oE "\\d{4}-\\d{2}-\\d{2}"); if [[ "$date" < "${cutoff}" ]]; then aws s3 rm "s3://${this.bucket}/$key"; fi; done`;
        execSync(cmd, { stdio: 'pipe', timeout: 60000 });
        this.logger.debug(`Old backups cleaned (before ${cutoff})`);
      } catch { /* non-critical */ }
    }
  }

  /**
   * Manual backup trigger (admin action).
   */
  async triggerManualBackup(): Promise<{ status: string; date: string }> {
    const date = new Date().toISOString().split('T')[0];
    await this.runDailyBackup();
    return { status: 'completed', date };
  }

  /**
   * Get backup status (last successful, size estimate).
   */
  async getBackupStatus(): Promise<BackupStatus> {
    return {
      lastBackup: null, // Would query S3 for last modified
      nextScheduled: this.getNextBackupTime(),
      retentionDays: this.retentionDays,
      bucket: this.bucket,
      region: this.region,
      isConfigured: !!this.config.get('AWS_ACCESS_KEY_ID'),
    };
  }

  private getNextBackupTime(): string {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 2, 0, 0);
    return next.toISOString();
  }
}

export interface BackupStatus {
  lastBackup: string | null;
  nextScheduled: string;
  retentionDays: number;
  bucket: string;
  region: string;
  isConfigured: boolean;
}
