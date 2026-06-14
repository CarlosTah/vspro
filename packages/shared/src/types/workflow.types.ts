/**
 * Workflow Orchestrator Types — Event-driven coordination layer.
 * Used by both API and Worker for cross-module workflow events.
 */

// ─── Workflow Event Types ────────────────────────────────────────

export type WorkflowEventType =
  | 'appointment.created'
  | 'appointment.cancelled'
  | 'appointment.rescheduled'
  | 'appointment.reminder_due'
  | 'appointment.no_show'
  | 'campaign.activated'
  | 'campaign.executed'
  | 'campaign.completed'
  | 'campaign.customer_converted'
  | 'customer.became_inactive'
  | 'customer.reengaged'
  | 'order.completed'
  | 'order.cancelled';

export interface WorkflowEvent {
  id: string;
  type: WorkflowEventType;
  tenantId: string;
  schemaName: string;
  payload: Record<string, any>;
  metadata: WorkflowMetadata;
  createdAt: string;
}

export interface WorkflowMetadata {
  source: 'scheduling' | 'retention' | 'orders' | 'messaging' | 'system';
  correlationId?: string;
  causationId?: string;
  userId?: string;
  customerId?: string;
}

// ─── Workflow State (JSONB stored in tenant schema) ──────────────

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface WorkflowInstance {
  id: string;
  type: string;
  status: WorkflowStatus;
  currentStep: string;
  context: Record<string, any>;
  events: WorkflowEventRef[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface WorkflowEventRef {
  eventId: string;
  type: WorkflowEventType;
  processedAt: string;
  result: 'success' | 'skipped' | 'failed';
}

// ─── Workflow Definitions ────────────────────────────────────────

export interface WorkflowDefinition {
  name: string;
  description: string;
  triggers: WorkflowEventType[];
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  name: string;
  action: string;
  module: 'scheduling' | 'retention' | 'messaging' | 'ai';
  params: Record<string, any>;
  conditions?: WorkflowCondition[];
  onFailure?: 'skip' | 'retry' | 'abort';
}

export interface WorkflowCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists';
  value: any;
}

// ─── Campaign Execution Context ─────────────────────────────────

export interface CampaignExecutionContext {
  campaignId: string;
  tenantId: string;
  schemaName: string;
  targetSegment: string;
  overrideSegment?: string;
  triggerThreshold: Record<string, any>;
  messageVariants: MessageVariant[];
  executionId: string;
}

export interface MessageVariant {
  variantName: string;
  contentTemplate: string;
  tone: string;
  discountCode?: string;
}

// ─── Scheduling Execution Context ───────────────────────────────

export interface SchedulingEventContext {
  appointmentId: string;
  tenantId: string;
  schemaName: string;
  customerId: string;
  staffId: string;
  startTime: string;
  endTime: string;
  serviceName: string;
  channelType: string;
}

// ─── Orchestrator Job Payloads ──────────────────────────────────

export interface OrchestratorJobPayload {
  type: 'workflow-event' | 'win-back-execution' | 'appointment-reminder' | 'calendar-sync';
  tenantId: string;
  schemaName: string;
  event: WorkflowEvent;
}
