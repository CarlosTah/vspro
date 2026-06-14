import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { WorkflowEventBus } from '../workflow-orchestrator/workflow-event-bus.service';
import {
  ApprovalRequest,
  ApprovalStatus,
  ApprovalType,
  ApprovalRule,
  CreateApprovalDto,
  DecideApprovalDto,
  DecisionMetadata,
  DEFAULT_APPROVAL_RULES,
} from './types';

/**
 * Human Audit Service — Core approval workflow engine.
 *
 * Enforces human-in-the-loop for high-risk operations.
 * Integrates with WorkflowOrchestratorModule via event bus.
 *
 * Flow:
 * 1. Module calls requireApproval() before executing a risky operation
 * 2. Service creates a pending approval request
 * 3. Dashboard user (admin/manager) gets real-time notification
 * 4. User approves/rejects via REST API
 * 5. On approval: original operation is released for execution
 * 6. On rejection: operation is cancelled, requester notified
 */
@Injectable()
export class HumanAuditService {
  private readonly logger = new Logger(HumanAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
    private readonly eventBus: WorkflowEventBus,
  ) {}

  // ─── Core API ─────────────────────────────────────────────────

  /**
   * Check if an operation requires human approval.
   * Returns true if the operation matches an active approval rule.
   */
  async requiresApproval(
    type: ApprovalType,
    payload: Record<string, any>,
    schemaName: string,
  ): Promise<boolean> {
    const rules = await this.getApprovalRules(schemaName);
    const rule = rules.find(r => r.type === type && r.enabled);

    if (!rule) return false;

    // Check conditions
    if (rule.conditions && rule.conditions.length > 0) {
      return rule.conditions.every(cond => this.evaluateCondition(cond, payload));
    }

    return true;
  }

  /**
   * Create a pending approval request.
   * Sends real-time notification to dashboard.
   * Returns the approval ID for tracking.
   */
  async createApprovalRequest(
    dto: CreateApprovalDto,
    schemaName: string,
    tenantId: string,
  ): Promise<ApprovalRequest> {
    const rules = await this.getApprovalRules(schemaName);
    const rule = rules.find(r => r.type === dto.type);

    const expiresAt = rule
      ? new Date(Date.now() + rule.autoExpireHours * 3600000).toISOString()
      : new Date(Date.now() + 48 * 3600000).toISOString();

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".approval_requests
        (type, status, payload, requested_by, expires_at, related_entity_id, related_entity_type)
      VALUES ($1, 'pending', $2::jsonb, $3, $4::timestamptz, $5, $6)
      RETURNING id, type, status, payload, requested_by AS "requestedBy",
                created_at AS "requestedAt", approved_by AS "approvedBy",
                decided_at AS "decidedAt", decision_metadata AS "decisionMetadata",
                expires_at AS "expiresAt", escalated_to AS "escalatedTo",
                related_entity_id AS "relatedEntityId", related_entity_type AS "relatedEntityType"
    `,
      dto.type,
      JSON.stringify(dto.payload),
      dto.requestedBy ?? 'system',
      expiresAt,
      dto.relatedEntityId ?? null,
      dto.relatedEntityType ?? null,
    );

    const approval = rows[0] as ApprovalRequest;

    // Real-time notification to dashboard
    this.eventsGateway.notifyTenant(tenantId, {
      type: 'approval_required',
      title: 'Aprobación requerida',
      message: `Se requiere aprobación para: ${dto.type}`,
      data: { approvalId: approval.id, type: dto.type, payload: dto.payload },
    });

    this.logger.log(`[${schemaName}] Approval request created: ${approval.id} (${dto.type})`);
    return approval;
  }

  /**
   * Approve or reject a pending request.
   * On approval: emits workflow event to release the operation.
   */
  async decide(
    approvalId: string,
    dto: DecideApprovalDto,
    userId: string,
    userRole: string,
    schemaName: string,
    tenantId: string,
  ): Promise<ApprovalRequest> {
    // Load the request
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, type, status, payload, requested_by AS "requestedBy",
             related_entity_id AS "relatedEntityId", related_entity_type AS "relatedEntityType"
      FROM "${schemaName}".approval_requests
      WHERE id = $1::uuid
    `, approvalId);

    if (!rows[0]) throw new NotFoundException('Approval request not found');

    const request = rows[0];

    if (request.status !== 'pending' && request.status !== 'escalated') {
      throw new BadRequestException(`Cannot decide on request with status: ${request.status}`);
    }

    // Check role permission
    const rules = await this.getApprovalRules(schemaName);
    const rule = rules.find(r => r.type === request.type);
    if (rule && !this.hasPermission(userRole, rule.requiredRole)) {
      throw new ForbiddenException(`Role '${userRole}' cannot decide on '${request.type}' approvals`);
    }

    // Update the request
    const newStatus: ApprovalStatus = dto.decision === 'approve' ? 'approved' : 'rejected';
    const decisionMetadata: DecisionMetadata = {
      reason: dto.reason,
      conditions: dto.conditions,
    };

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".approval_requests
      SET status = $1, approved_by = $2::uuid, decided_at = NOW(),
          decision_metadata = $3::jsonb
      WHERE id = $4::uuid
    `, newStatus, userId, JSON.stringify(decisionMetadata), approvalId);

    // Emit workflow event based on decision
    if (dto.decision === 'approve') {
      await this.eventBus.emit(
        'campaign.activated', // Generic — the orchestrator routes based on payload
        tenantId,
        schemaName,
        {
          approvalId,
          type: request.type,
          relatedEntityId: request.relatedEntityId,
          relatedEntityType: request.relatedEntityType,
          payload: request.payload,
          approvedBy: userId,
        },
        { source: 'system', userId },
      );
    }

    // Notify via WebSocket
    this.eventsGateway.notifyTenant(tenantId, {
      type: dto.decision === 'approve' ? 'approval_granted' : 'approval_rejected',
      title: dto.decision === 'approve' ? 'Solicitud aprobada' : 'Solicitud rechazada',
      message: `${request.type} fue ${dto.decision === 'approve' ? 'aprobada' : 'rechazada'}`,
      data: { approvalId, type: request.type, decision: dto.decision },
    });

    this.logger.log(`[${schemaName}] Approval ${approvalId} ${newStatus} by ${userId}`);

    return {
      ...request,
      status: newStatus,
      approvedBy: userId,
      decidedAt: new Date().toISOString(),
      decisionMetadata,
    };
  }

  // ─── Query Methods ────────────────────────────────────────────

  /**
   * Get pending approval requests for a tenant.
   */
  async getPendingApprovals(schemaName: string): Promise<ApprovalRequest[]> {
    return this.prisma.$queryRawUnsafe<ApprovalRequest[]>(`
      SELECT id, type, status, payload, requested_by AS "requestedBy",
             created_at AS "requestedAt", approved_by AS "approvedBy",
             decided_at AS "decidedAt", decision_metadata AS "decisionMetadata",
             expires_at AS "expiresAt", escalated_to AS "escalatedTo",
             related_entity_id AS "relatedEntityId", related_entity_type AS "relatedEntityType"
      FROM "${schemaName}".approval_requests
      WHERE status IN ('pending', 'escalated')
      ORDER BY created_at ASC
    `);
  }

  /**
   * Get approval history with pagination.
   */
  async getApprovalHistory(
    schemaName: string,
    options: { limit?: number; offset?: number; type?: ApprovalType; status?: ApprovalStatus },
  ): Promise<{ data: ApprovalRequest[]; total: number }> {
    const { limit = 20, offset = 0, type, status } = options;

    let where = 'WHERE 1=1';
    const params: any[] = [];
    let idx = 1;

    if (type) { where += ` AND type = $${idx++}`; params.push(type); }
    if (status) { where += ` AND status = $${idx++}`; params.push(status); }

    const countRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS total FROM "${schemaName}".approval_requests ${where}`, ...params,
    );

    const data = await this.prisma.$queryRawUnsafe<ApprovalRequest[]>(
      `SELECT id, type, status, payload, requested_by AS "requestedBy",
              created_at AS "requestedAt", approved_by AS "approvedBy",
              decided_at AS "decidedAt", decision_metadata AS "decisionMetadata",
              expires_at AS "expiresAt", related_entity_id AS "relatedEntityId"
       FROM "${schemaName}".approval_requests ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      ...params, limit, offset,
    );

    return { data, total: parseInt(countRows[0]?.total ?? '0') };
  }

  /**
   * Get the approval rules for a tenant.
   */
  async getApprovalRules(schemaName: string): Promise<ApprovalRule[]> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT approval_rules AS "approvalRules"
        FROM "${schemaName}".audit_config LIMIT 1
      `);
      return (rows[0]?.approvalRules ?? DEFAULT_APPROVAL_RULES) as ApprovalRule[];
    } catch {
      return DEFAULT_APPROVAL_RULES;
    }
  }

  /**
   * Update approval rules for a tenant.
   */
  async updateApprovalRules(schemaName: string, rules: ApprovalRule[]): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".audit_config
      SET approval_rules = $1::jsonb, updated_at = NOW()
    `, JSON.stringify(rules));
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private evaluateCondition(cond: { field: string; operator: string; value: any }, payload: Record<string, any>): boolean {
    const actual = payload[cond.field];
    if (actual === undefined || actual === null) return false;

    switch (cond.operator) {
      case 'gt': return actual > cond.value;
      case 'lt': return actual < cond.value;
      case 'gte': return actual >= cond.value;
      case 'lte': return actual <= cond.value;
      case 'eq': return actual === cond.value;
      default: return false;
    }
  }

  private hasPermission(userRole: string, requiredRole: string): boolean {
    const hierarchy = ['operator', 'manager', 'admin', 'owner'];
    return hierarchy.indexOf(userRole) >= hierarchy.indexOf(requiredRole);
  }
}
