import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { BackupEngineService } from './backup-engine.service';

/**
 * Backup Cron Registry — Schedules and dispatches backup jobs.
 *
 * Cron: "0 2 * * *" (2:00 AM daily)
 * Queue: infrastructure-backups
 *
 * Separation of concerns:
 * - CronRegistry schedules → enqueues job
 * - Worker (BackupProcessor) executes the actual backup
 * - BackupEngineService contains the logic
 */
@Injectable()
export class BackupCronRegistry {
  private readonly logger = new Logger(BackupCronRegistry.name);

  constructor(
    private readonly backupEngine: BackupEngineService,
    @InjectQueue('infrastructure-backups') private readonly backupQueue: Queue,
  ) {}

  /**
   * Daily backup — 2:00 AM.
   * Enqueues a backup job for the worker to process.
   */
  @Cron('0 2 * * *', { name: 'daily-backup-engine' })
  async scheduleDailyBackup(): Promise<void> {
    const date = new Date().toISOString().split('T')[0];

    this.logger.log(`💾 Backup cron: scheduling daily backup for ${date}`);

    await this.backupQueue.add('run-full-backup', {
      date,
      triggeredBy: 'cron',
      timestamp: new Date().toISOString(),
    }, {
      jobId: `backup-${date}`,
      attempts: 2,
      backoff: { type: 'fixed', delay: 300000 }, // 5 min between retries
      timeout: 600000, // 10 min max
    });
  }

  /**
   * Weekly cleanup — Sundays at 3:00 AM.
   */
  @Cron('0 3 * * 0', { name: 'weekly-backup-cleanup' })
  async scheduleWeeklyCleanup(): Promise<void> {
    this.logger.log('🧹 Backup cleanup scheduled');

    await this.backupQueue.add('cleanup-old-backups', {
      triggeredBy: 'cron',
      timestamp: new Date().toISOString(),
    }, {
      jobId: `cleanup-${new Date().toISOString().split('T')[0]}`,
    });
  }

  /**
   * Manual trigger (admin action).
   */
  async triggerManualBackup(triggeredBy: string): Promise<{ jobId: string }> {
    const date = new Date().toISOString().split('T')[0];
    const jobId = `backup-manual-${date}-${Date.now()}`;

    await this.backupQueue.add('run-full-backup', {
      date,
      triggeredBy,
      manual: true,
      timestamp: new Date().toISOString(),
    }, { jobId });

    this.logger.log(`Manual backup triggered by ${triggeredBy}`);
    return { jobId };
  }
}
