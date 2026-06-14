import OpenAI from 'openai';

/**
 * VSPRO Agent Orchestrator — Multi-Agent System Types
 *
 * Architecture: Supervisor Pattern
 * - Supervisor receives all tasks and delegates to specialized agents
 * - Agents report back to supervisor with results
 * - Supervisor decides: accept, retry, escalate, or combine responses
 * - Audit layer intercepts high-risk operations before execution
 */

// ─── Extended Agent Types (includes new specialized agents) ─────

export type OrchestratorAgentType =
  | 'lead-manager'
  | 'it-infrastructure'
  | 'real-estate-analytics'
  | 'sales'
  | 'inventory'
  | 'finance'
  | 'support'
  | 'general';

export const ORCHESTRATOR_AGENT_TYPES: OrchestratorAgentType[] = [
  'lead-manager',
  'it-infrastructure',
  'real-estate-analytics',
  'sales',
  'inventory',
  'finance',
  'support',
  'general',
];

// ─── Supervisor Pattern Types ───────────────────────────────────

export interface SupervisorDecision {
  action: 'accept' | 'retry' | 'escalate' | 'combine' | 'audit_required';
  delegatedTo: OrchestratorAgentType;
  confidence: number;
  reasoning: string;
  requiresApproval: boolean;
  auditContext?: AuditContext;
}

export interface AuditContext {
  operationType: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  affectedEntities: number;
  estimatedImpact: string;
}

export interface AgentTask {
  id: string;
  type: 'query' | 'action' | 'analysis' | 'report';
  description: string;
  delegatedTo: OrchestratorAgentType;
  status: AgentTaskStatus;
  input: Record<string, any>;
  output?: AgentTaskOutput;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  completedAt?: string;
  supervisorNotes?: string;
}

export type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'escalated' | 'audit_hold';

export interface AgentTaskOutput {
  response: string;
  toolsUsed: string[];
  confidence: number;
  data?: Record<string, any>;
  suggestedActions?: string[];
}

// ─── Orchestrator Session (JSONB persisted) ─────────────────────

export interface OrchestratorSession {
  id: string;
  tenantId: string;
  schemaName: string;
  userId: string;
  status: 'active' | 'completed' | 'failed';
  tasks: AgentTask[];
  supervisorLog: SupervisorLogEntry[];
  context: SessionContext;
  createdAt: string;
  updatedAt: string;
}

export interface SupervisorLogEntry {
  timestamp: string;
  action: string;
  agent?: OrchestratorAgentType;
  decision?: SupervisorDecision;
  message: string;
}

export interface SessionContext {
  objective: string;
  currentPhase: string;
  agentStates: Record<OrchestratorAgentType, AgentState>;
  sharedMemory: Record<string, any>;
}

export interface AgentState {
  lastActive: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  isAvailable: boolean;
}

// ─── Agent Capability Registry ──────────────────────────────────

export interface AgentCapability {
  agent: OrchestratorAgentType;
  name: string;
  description: string;
  domains: string[];
  tools: OpenAI.Chat.ChatCompletionTool[];
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
}

// ─── Lead Manager Agent Types ───────────────────────────────────

export interface LeadManagerContext {
  totalLeads: number;
  pipelineStages: PipelineStage[];
  conversionRate: number;
  revenueGoal: number;
}

export interface PipelineStage {
  name: string;
  count: number;
  value: number;
  avgDaysInStage: number;
}

// ─── IT Infrastructure Agent Types ──────────────────────────────

export interface InfrastructureContext {
  services: ServiceHealth[];
  alerts: InfraAlert[];
  resourceUsage: ResourceMetrics;
  lastDeployment: string;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  uptime: number;
}

export interface InfraAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  service: string;
  message: string;
  timestamp: string;
}

export interface ResourceMetrics {
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  activeConnections: number;
}

// ─── Real Estate Analytics Agent Types ──────────────────────────

export interface RealEstateContext {
  properties: PropertyMetrics[];
  occupancyRate: number;
  averageNightlyRate: number;
  revenueThisMonth: number;
  pendingReservations: number;
}

export interface PropertyMetrics {
  id: string;
  name: string;
  occupancyRate: number;
  averageRate: number;
  revenue30d: number;
  upcomingBookings: number;
}

// ─── Supervisor Configuration ───────────────────────────────────

export interface SupervisorConfig {
  maxConcurrentTasks: number;
  taskTimeout: number; // seconds
  retryPolicy: {
    maxAttempts: number;
    backoffMs: number;
  };
  escalationThreshold: number; // confidence below this → escalate
  auditThreshold: 'all' | 'high_risk' | 'critical_only';
  agentPriority: OrchestratorAgentType[];
}

export const DEFAULT_SUPERVISOR_CONFIG: SupervisorConfig = {
  maxConcurrentTasks: 3,
  taskTimeout: 30,
  retryPolicy: { maxAttempts: 2, backoffMs: 3000 },
  escalationThreshold: 0.5,
  auditThreshold: 'high_risk',
  agentPriority: ['lead-manager', 'real-estate-analytics', 'it-infrastructure', 'sales', 'general'],
};
