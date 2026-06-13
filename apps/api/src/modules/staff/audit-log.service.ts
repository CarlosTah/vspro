import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma.service';

/**
 * Audit Log Service — Records all staff actions for security and compliance.
 *
 * Every sensitive operation (create/update/delete staff, change roles,
 * reset passwords) is logged with: who, what, when, and details.
 *
 * Logs are stored in a dedicated audit_log table and also queued
 * for async processing (analytics, alerts on suspicious activity).
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('staff-audit') private readonly auditQueue: Queue,
  ) {}

  /**
   * Log an audit event.
   */
  async log(event: AuditEvent): Promise<void> {
    const { schemaName, action, actorId, targetId, details } = event;

    // Ensure audit_log table exists
    await this.ensureAuditTable(schemaName);

    // Insert audit record
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".audit_log (action, actor_id, target_id, details)
      VALUES ($1, $2::uuid, $3, $4::jsonb)
    `, action, actorId, targetId ?? null, JSON.stringify(details ?? {}));

    // Queue for async processing (alerts, analytics)
    await this.auditQueue.add('process-audit-event', {
      schemaName,
      action,
      actorId,
      targetId,
      details,
      timestamp: new Date().toISOString(),
    }, { removeOnComplete: 500 });

    this.logger.debug(`[${schemaName}] Audit: ${action} by ${actorId}${targetId ? ` on ${targetId}` : ''}`);
  }

  /**
   * Get recent audit logs for dashboard.
   */
  async getRecentLogs(schemaName: string, limit = 50): Promise<AuditLogEntry[]> {
    await this.ensureAuditTable(schemaName);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT al.id, al.action, al.actor_id, al.target_id, al.details, al.created_at,
             u.name AS actor_name, u.email AS actor_email
      FROM "${schemaName}".audit_log al
      LEFT JOIN "${schemaName}".users u ON u.id = al.actor_id
      ORDER BY al.created_at DESC
      LIMIT $1
    `, limit);

    return rows.map(r => ({
      id: r.id,
      action: r.action,
      actorId: r.actor_id,
      actorName: r.actor_name,
      actorEmail: r.actor_email,
      targetId: r.target_id,
      details: r.details,
      createdAt: r.created_at,
    }));
  }

  /**
   * Get audit logs for a specific user.
   */
  async getLogsForUser(userId: string, schemaName: string): Promise<AuditLogEntry[]> {
    await this.ensureAuditTable(schemaName);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, action, actor_id, target_id, details, created_at
      FROM "${schemaName}".audit_log
      WHERE actor_id = $1::uuid OR target_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `, userId);

    return rows.map(r => ({
      id: r.id, action: r.action, actorId: r.actor_id, actorName: null,
      actorEmail: null, targetId: r.target_id, details: r.details, createdAt: r.created_at,
    }));
  }

  // ─── Schema Management ────────────────────────────────────────

  private async ensureAuditTable(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action VARCHAR(100) NOT NULL,
        actor_id UUID,
        target_id VARCHAR(255),
        details JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON "${schemaName}".audit_log(actor_id)
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_audit_log_created ON "${schemaName}".audit_log(created_at DESC)
    `);
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface AuditEvent {
  schemaName: string;
  action: string;
  actorId: string;
  targetId?: string | null;
  details?: Record<string, any>;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorName: string | null;
  actorEmail: string | null;
  targetId: string | null;
  details: Record<string, any>;
  createdAt: Date;
}
