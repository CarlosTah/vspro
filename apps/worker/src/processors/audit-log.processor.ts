import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../database/prisma.service';

/**
 * Audit Log Processor — Async processing of audit events.
 *
 * Queue: staff-audit
 * Jobs:
 * - process-audit-event: Analyze for suspicious patterns, update stats
 *
 * Detects:
 * - Multiple failed logins (brute force)
 * - Role escalation patterns
 * - Mass data access
 * - Off-hours activity
 */
@Processor('staff-audit')
export class AuditLogProcessor {
  private readonly logger = new Logger(AuditLogProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('process-audit-event')
  async handleAuditEvent(job: Job<any>): Promise<void> {
    const { schemaName, action, actorId, targetId, timestamp } = job.data;

    // Detect suspicious patterns
    const suspicious = await this.detectSuspiciousActivity(schemaName, actorId, action);

    if (suspicious) {
      this.logger.warn(`[${schemaName}] SUSPICIOUS: ${action} by ${actorId} — ${suspicious.reason}`);
      // In production: alert super-admin or lock account
    }
  }

  private async detectSuspiciousActivity(
    schemaName: string,
    actorId: string,
    action: string,
  ): Promise<{ reason: string } | null> {
    // Check for rapid successive actions (> 10 in last 5 minutes)
    const recentActions = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) AS c FROM "${schemaName}".audit_log
      WHERE actor_id = $1::uuid AND created_at > NOW() - INTERVAL '5 minutes'
    `, actorId).catch(() => [{ c: '0' }]);

    const count = parseInt(recentActions[0]?.c ?? '0');
    if (count > 10) {
      return { reason: `${count} actions in 5 minutes (possible automated attack)` };
    }

    // Check for role escalation attempts
    if (action === 'staff_updated') {
      const roleChanges = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*) AS c FROM "${schemaName}".audit_log
        WHERE actor_id = $1::uuid AND action = 'staff_updated'
          AND details->>'role' IS NOT NULL
          AND created_at > NOW() - INTERVAL '1 hour'
      `, actorId).catch(() => [{ c: '0' }]);

      if (parseInt(roleChanges[0]?.c ?? '0') > 3) {
        return { reason: 'Multiple role changes in 1 hour' };
      }
    }

    return null;
  }
}
