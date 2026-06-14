/**
 * Human Audit Layer — Types & Interfaces
 */

// ─── Approval Request ───────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'escalated';

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  status: ApprovalStatus;
  payload: Record<string, any>;
  requestedBy: string | null;    // userId or 'system'
  requestedAt: string;
  approvedBy: string | null;     // userId of approver
  decidedAt: string | null;
  decisionMetadata: DecisionMetadata | null;
  expiresAt: string | null;
  escalatedTo: string | null;
  relatedEntityId: string | null; // campaign_id, order_id, etc.
  relatedEntityType: string | null;
}

export interface DecisionMetadata {
  reason?: string;
  conditions?: string[];
  overrideLevel?: 'standard' | 'emergency';
  ipAddress?: string;
}

// ─── Approval Types ─────────────────────────────────────────────

export type ApprovalType =
  | 'campaign.activate'
  | 'campaign.bulk_send'
  | 'discount.high_value'
  | 'tenant.deprovision'
  | 'schedule.bulk_change'
  | 'order.bulk_cancel'
  | 'staff.role_change'
  | 'custom';

export const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  'campaign.activate': 'Activar campaña de retención',
  'campaign.bulk_send': 'Envío masivo de mensajes',
  'discount.high_value': 'Descuento alto (>20%)',
  'tenant.deprovision': 'Eliminar tenant',
  'schedule.bulk_change': 'Cambio masivo de horarios',
  'order.bulk_cancel': 'Cancelación masiva de pedidos',
  'staff.role_change': 'Cambio de rol de staff',
  'custom': 'Aprobación personalizada',
};

// ─── Approval Rules (configurable per tenant) ───────────────────

export interface ApprovalRule {
  type: ApprovalType;
  enabled: boolean;
  requiredRole: 'admin' | 'manager';
  autoExpireHours: number;
  escalateAfterHours: number;
  escalateTo: 'admin' | 'owner';
  conditions?: ApprovalCondition[];
}

export interface ApprovalCondition {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number | string;
}

export const DEFAULT_APPROVAL_RULES: ApprovalRule[] = [
  {
    type: 'campaign.activate',
    enabled: true,
    requiredRole: 'admin',
    autoExpireHours: 48,
    escalateAfterHours: 24,
    escalateTo: 'owner',
  },
  {
    type: 'campaign.bulk_send',
    enabled: true,
    requiredRole: 'admin',
    autoExpireHours: 24,
    escalateAfterHours: 12,
    escalateTo: 'admin',
    conditions: [{ field: 'targetCount', operator: 'gt', value: 50 }],
  },
  {
    type: 'discount.high_value',
    enabled: true,
    requiredRole: 'manager',
    autoExpireHours: 4,
    escalateAfterHours: 2,
    escalateTo: 'admin',
    conditions: [{ field: 'discountPercent', operator: 'gt', value: 20 }],
  },
  {
    type: 'tenant.deprovision',
    enabled: true,
    requiredRole: 'admin',
    autoExpireHours: 72,
    escalateAfterHours: 48,
    escalateTo: 'owner',
  },
  {
    type: 'schedule.bulk_change',
    enabled: true,
    requiredRole: 'admin',
    autoExpireHours: 24,
    escalateAfterHours: 12,
    escalateTo: 'admin',
    conditions: [{ field: 'affectedStaff', operator: 'gt', value: 3 }],
  },
  {
    type: 'order.bulk_cancel',
    enabled: true,
    requiredRole: 'admin',
    autoExpireHours: 12,
    escalateAfterHours: 6,
    escalateTo: 'admin',
    conditions: [{ field: 'orderCount', operator: 'gt', value: 5 }],
  },
  {
    type: 'staff.role_change',
    enabled: true,
    requiredRole: 'admin',
    autoExpireHours: 48,
    escalateAfterHours: 24,
    escalateTo: 'owner',
  },
];

// ─── Audit Trail Entry ──────────────────────────────────────────

export interface AuditEntry {
  id: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  userId: string | null;
  userName: string | null;
  tenantId: string;
  schemaName: string;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  metadata: Record<string, any>;
  createdAt: string;
}

// ─── DTOs ───────────────────────────────────────────────────────

export interface CreateApprovalDto {
  type: ApprovalType;
  payload: Record<string, any>;
  relatedEntityId?: string;
  relatedEntityType?: string;
  requestedBy?: string;
}

export interface DecideApprovalDto {
  decision: 'approve' | 'reject';
  reason?: string;
  conditions?: string[];
}
