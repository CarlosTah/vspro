import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { HumanAuditService } from './human-audit.service';
import { ApprovalRule } from './types';

/**
 * Approval Workflow Service — Escalation and expiration engine.
 *
 * Responsibilities:
 * - Escalate pending approvals after configured threshold
 * - Expire approvals that exceed auto-expire window
 * - Notify escalation targets via WebSocket
 */
@Injectable()
export class ApprovalWorkflowService {
  private readonly logger = new Logger(ApprovalWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
    private readonly humanAudit: HumanAuditService,
  ) {}

  /**
   * Scan for approvals needing escalation or expiration.
   * Runs every 5 minutes.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processEscalations(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, schemaName: true },
    });

    for (const tenant of tenants) {
      try {
        await this.processTenantEscalations(tenant.id, tenant.schemaName);
      } catch {
        // Skip tenants without the table
      }
    }
  }

  private async processTenantEscalations(tenantId: string, schemaName: string): Promise<void> {
    const rules = await this.humanAudit.getApprovalRules(schemaName);

    // Get pending requests
    const pending = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, type, status, created_at AS "createdAt", expires_at AS "expiresAt"
      FROM "${schemaName}".approval_requests
      WHERE status IN ('pending', 'escalated')
    `);

    for (const request of pending) {
      const rule = rules.find((r: ApprovalRule) => r.type === request.type);
      if (!rule) continue;

      const hoursSinceCreated = (Date.now() - new Date(request.createdAt).getTime()) / 3600000;

      // Check expiration
      if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
        await this.prisma.$executeRawUnsafe(`
          UPDATE "${schemaName}".approval_requests SET status = 'expired' WHERE id = $1::uuid
        `, request.id);

        this.eventsGateway.notifyTenant(tenantId, {
          type: 'approval_expired',
          title: 'Solicitud expirada',
          message: `La solicitud ${request.type} expiró sin decisión`,
          data: { approvalId: request.id, type: request.type },
        });

        this.logger.warn(`[${schemaName}] Approval ${request.id} expired`);
        continue;
      }

      // Check escalation
      if (request.status === 'pending' && hoursSinceCreated >= rule.escalateAfterHours) {
        await this.prisma.$executeRawUnsafe(`
          UPDATE "${schemaName}".approval_requests
          SET status = 'escalated', escalated_to = $1
          WHERE id = $2::uuid
        `, rule.escalateTo, request.id);

        this.eventsGateway.notifyTenant(tenantId, {
          type: 'approval_escalated',
          title: 'Solicitud escalada',
          message: `Se escaló a ${rule.escalateTo}: ${request.type}`,
          data: { approvalId: request.id, type: request.type, escalatedTo: rule.escalateTo },
        });

        this.logger.warn(`[${schemaName}] Approval ${request.id} escalated to ${rule.escalateTo}`);
      }
    }
  }
}
