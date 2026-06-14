import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditEntry } from './types';

/**
 * Audit Trail Service — Immutable record of all significant operations.
 *
 * Stores before/after state for every mutating operation across modules.
 * Used for:
 * - Compliance (who did what, when)
 * - Debugging (trace state changes)
 * - Security (detect unauthorized modifications)
 * - Undo capability (store previous state)
 */
@Injectable()
export class AuditTrailService {
  private readonly logger = new Logger(AuditTrailService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an audit entry.
   * Called by modules after any significant state change.
   */
  async record(
    schemaName: string,
    entry: {
      action: string;
      module: string;
      entityType: string;
      entityId: string;
      userId?: string | null;
      userName?: string | null;
      before?: Record<string, any> | null;
      after?: Record<string, any> | null;
      metadata?: Record<string, any>;
    },
  ): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".audit_trail
          (action, module, entity_type, entity_id, user_id, user_name, before_state, after_state, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
      `,
        entry.action,
        entry.module,
        entry.entityType,
        entry.entityId,
        entry.userId ?? null,
        entry.userName ?? null,
        entry.before ? JSON.stringify(entry.before) : null,
        entry.after ? JSON.stringify(entry.after) : null,
        JSON.stringify(entry.metadata ?? {}),
      );
    } catch (err: any) {
      // Non-blocking: audit failures should not break operations
      this.logger.error(`Failed to record audit entry: ${err.message}`);
    }
  }

  /**
   * Get audit trail for a specific entity.
   */
  async getEntityHistory(
    schemaName: string,
    entityType: string,
    entityId: string,
  ): Promise<AuditEntry[]> {
    return this.prisma.$queryRawUnsafe<AuditEntry[]>(`
      SELECT id, action, module, entity_type AS "entityType", entity_id AS "entityId",
             user_id AS "userId", user_name AS "userName",
             before_state AS "before", after_state AS "after",
             metadata, created_at AS "createdAt"
      FROM "${schemaName}".audit_trail
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC
    `, entityType, entityId);
  }

  /**
   * Get recent audit entries with pagination.
   */
  async getRecent(
    schemaName: string,
    options: { limit?: number; offset?: number; module?: string; action?: string },
  ): Promise<{ data: AuditEntry[]; total: number }> {
    const { limit = 50, offset = 0, module, action } = options;

    let where = 'WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (module) { where += ` AND module = $${idx++}`; params.push(module); }
    if (action) { where += ` AND action = $${idx++}`; params.push(action); }

    const countRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS total FROM "${schemaName}".audit_trail ${where}`, ...params,
    );

    const data = await this.prisma.$queryRawUnsafe<AuditEntry[]>(
      `SELECT id, action, module, entity_type AS "entityType", entity_id AS "entityId",
              user_id AS "userId", user_name AS "userName",
              before_state AS "before", after_state AS "after",
              metadata, created_at AS "createdAt"
       FROM "${schemaName}".audit_trail ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      ...params, limit, offset,
    );

    return { data, total: parseInt(countRows[0]?.total ?? '0') };
  }

  /**
   * Get audit entries by user (for user activity log).
   */
  async getByUser(schemaName: string, userId: string, limit = 20): Promise<AuditEntry[]> {
    return this.prisma.$queryRawUnsafe<AuditEntry[]>(`
      SELECT id, action, module, entity_type AS "entityType", entity_id AS "entityId",
             user_id AS "userId", user_name AS "userName",
             metadata, created_at AS "createdAt"
      FROM "${schemaName}".audit_trail
      WHERE user_id = $1
      ORDER BY created_at DESC LIMIT $2
    `, userId, limit);
  }
}
