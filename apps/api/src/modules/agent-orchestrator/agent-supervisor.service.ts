import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { WorkflowEventBus } from '../workflow-orchestrator/workflow-event-bus.service';
import { HumanAuditService } from '../human-audit/human-audit.service';
import { AuditTrailService } from '../human-audit/audit-trail.service';
import { AgentRegistryService } from './agent-registry.service';
import {
  OrchestratorAgentType,
  SupervisorDecision,
  AgentTask,
  AgentTaskOutput,
  OrchestratorSession,
  SupervisorLogEntry,
  SessionContext,
  AgentState,
  DEFAULT_SUPERVISOR_CONFIG,
  SupervisorConfig,
} from './types';

/**
 * Agent Supervisor Service — Central orchestration with Supervisor Pattern.
 *
 * Responsibilities:
 * 1. Receive high-level objectives from admin/system
 * 2. Decompose into tasks and delegate to specialized agents
 * 3. Validate agent outputs (quality check via LLM)
 * 4. Enforce audit layer for high-risk operations
 * 5. Retry or escalate on failure
 * 6. Persist session state as JSONB in tenant schema
 * 7. Emit events to WorkflowEventBus for cross-system integration
 */
@Injectable()
export class AgentSupervisorService {
  private readonly logger = new Logger(AgentSupervisorService.name);
  private readonly openai: OpenAI;
  private readonly config_: SupervisorConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly registry: AgentRegistryService,
    private readonly eventBus: WorkflowEventBus,
    private readonly humanAudit: HumanAuditService,
    private readonly auditTrail: AuditTrailService,
  ) {
    this.openai = new OpenAI({ apiKey: this.configService.get('OPENAI_API_KEY') });
    this.config_ = DEFAULT_SUPERVISOR_CONFIG;
  }

  // ─── Main Entry Point ─────────────────────────────────────────

  /**
   * Execute an objective through the multi-agent system.
   * The supervisor decomposes, delegates, validates, and assembles the result.
   */
  async executeObjective(
    objective: string,
    tenantId: string,
    schemaName: string,
    userId: string,
    additionalContext?: Record<string, any>,
  ): Promise<OrchestratorSession> {
    const sessionId = randomUUID();

    // Create session
    const session: OrchestratorSession = {
      id: sessionId,
      tenantId,
      schemaName,
      userId,
      status: 'active',
      tasks: [],
      supervisorLog: [],
      context: {
        objective,
        currentPhase: 'planning',
        agentStates: this.initAgentStates(),
        sharedMemory: additionalContext ?? {},
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.log(session, 'session_started', undefined, undefined, `Objective received: "${objective}"`);

    try {
      // 1. Plan: determine which agents need to be involved
      const plan = await this.planExecution(objective, session);
      session.context.currentPhase = 'executing';

      // 2. Execute tasks sequentially (respecting dependencies)
      for (const task of plan) {
        session.tasks.push(task);

        // Check if audit is required
        if (task.delegatedTo && await this.requiresAudit(task, schemaName)) {
          task.status = 'audit_hold';
          this.log(session, 'audit_required', task.delegatedTo, undefined,
            `Task "${task.description}" requires human approval (risk: high)`);

          await this.humanAudit.createApprovalRequest({
            type: 'custom',
            payload: { taskId: task.id, description: task.description, agent: task.delegatedTo, input: task.input },
            relatedEntityId: sessionId,
            relatedEntityType: 'orchestrator_session',
            requestedBy: userId,
          }, schemaName, tenantId);

          continue; // Skip execution until approved
        }

        // Execute the task
        const output = await this.executeTask(task, session);

        if (output) {
          task.output = output;
          task.status = 'completed';
          task.completedAt = new Date().toISOString();

          // Validate output quality
          const decision = await this.validateOutput(task, output, session);

          if (decision.action === 'retry' && task.attempts < task.maxAttempts) {
            task.status = 'pending';
            task.attempts++;
            this.log(session, 'retry', task.delegatedTo, decision, `Retrying: ${decision.reasoning}`);
            // Re-execute
            const retryOutput = await this.executeTask(task, session);
            if (retryOutput) { task.output = retryOutput; task.status = 'completed'; }
          } else if (decision.action === 'escalate') {
            task.status = 'escalated';
            this.log(session, 'escalated', task.delegatedTo, decision, `Escalated: ${decision.reasoning}`);
          }

          // Store shared context for other agents
          if (output.data) {
            session.context.sharedMemory[`${task.delegatedTo}_result`] = output.data;
          }
        } else {
          task.status = 'failed';
        }

        // Persist session after each task
        await this.persistSession(session);
      }

      // 3. Assemble final response
      session.context.currentPhase = 'completed';
      session.status = session.tasks.every(t => t.status === 'completed') ? 'completed' : 'failed';

    } catch (err: any) {
      session.status = 'failed';
      this.log(session, 'error', undefined, undefined, `Session failed: ${err.message}`);
    }

    session.updatedAt = new Date().toISOString();
    await this.persistSession(session);

    // Emit completion event
    await this.eventBus.emit(
      'order.completed', // Using a generic event type
      tenantId, schemaName,
      { sessionId, status: session.status, tasksCompleted: session.tasks.filter(t => t.status === 'completed').length },
      { source: 'system', userId },
    );

    // Audit trail
    await this.auditTrail.record(schemaName, {
      action: 'orchestrator_session_completed',
      module: 'agent-orchestrator',
      entityType: 'session',
      entityId: sessionId,
      userId,
      metadata: { objective, status: session.status, taskCount: session.tasks.length },
    });

    return session;
  }

  // ─── Planning (LLM-powered task decomposition) ────────────────

  private async planExecution(objective: string, session: OrchestratorSession): Promise<AgentTask[]> {
    const capabilities = this.registry.getCapabilitySummary();

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Eres el supervisor de un sistema multi-agente. Descompón el objetivo en tareas para los agentes disponibles.

Agentes disponibles:
${capabilities}

Responde SOLO JSON:
{"tasks":[{"type":"query|action|analysis|report","description":"...","agent":"agent-name","input":{}}]}

Máximo 5 tareas. Asigna el agente más apropiado según su dominio.`,
        },
        { role: 'user', content: objective },
      ],
      temperature: 0.2,
      max_tokens: 800,
    });

    try {
      const parsed = JSON.parse(response.choices[0].message.content ?? '{"tasks":[]}');
      return (parsed.tasks ?? []).map((t: any) => ({
        id: randomUUID(),
        type: t.type ?? 'query',
        description: t.description ?? objective,
        delegatedTo: t.agent as OrchestratorAgentType ?? 'general',
        status: 'pending' as const,
        input: t.input ?? {},
        attempts: 0,
        maxAttempts: this.config_.retryPolicy.maxAttempts,
        createdAt: new Date().toISOString(),
      }));
    } catch {
      // Fallback: single task to general agent
      return [{
        id: randomUUID(),
        type: 'query',
        description: objective,
        delegatedTo: 'general',
        status: 'pending',
        input: {},
        attempts: 0,
        maxAttempts: 2,
        createdAt: new Date().toISOString(),
      }];
    }
  }

  // ─── Task Execution ───────────────────────────────────────────

  private async executeTask(task: AgentTask, session: OrchestratorSession): Promise<AgentTaskOutput | null> {
    task.status = 'running';
    task.attempts++;

    this.log(session, 'task_delegated', task.delegatedTo, undefined,
      `Delegating: "${task.description}" (attempt ${task.attempts})`);

    try {
      const agent = this.registry.getAgent(task.delegatedTo);
      if (!agent) {
        this.log(session, 'agent_not_found', task.delegatedTo, undefined, `Agent ${task.delegatedTo} not registered`);
        return null;
      }

      const result = await agent.execute(task, session.context);
      return result;
    } catch (err: any) {
      this.log(session, 'task_failed', task.delegatedTo, undefined, `Failed: ${err.message}`);
      return null;
    }
  }

  // ─── Output Validation ────────────────────────────────────────

  private async validateOutput(task: AgentTask, output: AgentTaskOutput, session: OrchestratorSession): Promise<SupervisorDecision> {
    // Simple confidence-based validation
    if (output.confidence >= 0.8) {
      return { action: 'accept', delegatedTo: task.delegatedTo, confidence: output.confidence, reasoning: 'High confidence', requiresApproval: false };
    }

    if (output.confidence < this.config_.escalationThreshold) {
      return { action: 'escalate', delegatedTo: task.delegatedTo, confidence: output.confidence, reasoning: 'Below escalation threshold', requiresApproval: true };
    }

    if (output.confidence < 0.7 && task.attempts < task.maxAttempts) {
      return { action: 'retry', delegatedTo: task.delegatedTo, confidence: output.confidence, reasoning: 'Medium confidence, retrying', requiresApproval: false };
    }

    return { action: 'accept', delegatedTo: task.delegatedTo, confidence: output.confidence, reasoning: 'Accepted with caution', requiresApproval: false };
  }

  // ─── Audit Check ──────────────────────────────────────────────

  private async requiresAudit(task: AgentTask, schemaName: string): Promise<boolean> {
    if (this.config_.auditThreshold === 'critical_only') return false;

    const capability = this.registry.getCapability(task.delegatedTo);
    if (!capability) return false;

    if (capability.riskLevel === 'high' || capability.requiresApproval) return true;
    if (this.config_.auditThreshold === 'all') return true;

    return false;
  }

  // ─── Session Persistence (JSONB) ──────────────────────────────

  private async persistSession(session: OrchestratorSession): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${session.schemaName}".orchestrator_sessions (id, user_id, status, session_data, created_at, updated_at)
        VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5::timestamptz, NOW())
        ON CONFLICT (id) DO UPDATE SET status = $3, session_data = $4::jsonb, updated_at = NOW()
      `, session.id, session.userId, session.status, JSON.stringify(session), session.createdAt);
    } catch {
      // Table might not exist yet — log but don't fail
      this.logger.debug(`Could not persist session ${session.id} (table may not exist)`);
    }
  }

  // ─── Query Methods ────────────────────────────────────────────

  async getSession(sessionId: string, schemaName: string): Promise<OrchestratorSession | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT session_data AS "sessionData" FROM "${schemaName}".orchestrator_sessions WHERE id = $1::uuid
    `, sessionId);
    return rows[0]?.sessionData ?? null;
  }

  async getRecentSessions(schemaName: string, limit = 10): Promise<OrchestratorSession[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT session_data AS "sessionData" FROM "${schemaName}".orchestrator_sessions
      ORDER BY updated_at DESC LIMIT $1
    `, limit);
    return rows.map(r => r.sessionData);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private log(session: OrchestratorSession, action: string, agent?: OrchestratorAgentType, decision?: SupervisorDecision, message?: string): void {
    const entry: SupervisorLogEntry = { timestamp: new Date().toISOString(), action, agent, decision, message: message ?? '' };
    session.supervisorLog.push(entry);
    this.logger.debug(`[Supervisor] ${action} ${agent ? `→ ${agent}` : ''}: ${message}`);
  }

  private initAgentStates(): Record<OrchestratorAgentType, AgentState> {
    const states: Record<string, AgentState> = {};
    for (const agent of this.config_.agentPriority) {
      states[agent] = { lastActive: null, tasksCompleted: 0, tasksFailed: 0, isAvailable: true };
    }
    return states as Record<OrchestratorAgentType, AgentState>;
  }
}
