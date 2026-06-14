import { Injectable, Logger } from '@nestjs/common';
import { LeadManagerAgent } from './agents/lead-manager.agent';
import { ItInfrastructureAgent } from './agents/it-infrastructure.agent';
import { RealEstateAnalyticsAgent } from './agents/real-estate-analytics.agent';
import { OrchestratorAgentType, AgentCapability, AgentTask, AgentTaskOutput, SessionContext } from './types';

/**
 * Interface that all orchestrator agents must implement.
 */
export interface OrchestratorAgent {
  readonly name: OrchestratorAgentType;
  readonly description: string;
  readonly domains: string[];
  readonly riskLevel: 'low' | 'medium' | 'high';
  readonly requiresApproval: boolean;

  execute(task: AgentTask, context: SessionContext): Promise<AgentTaskOutput>;
}

/**
 * Agent Registry — Manages registration and lookup of specialized agents.
 */
@Injectable()
export class AgentRegistryService {
  private readonly logger = new Logger(AgentRegistryService.name);
  private readonly agents = new Map<OrchestratorAgentType, OrchestratorAgent>();

  constructor(
    private readonly leadManager: LeadManagerAgent,
    private readonly itInfra: ItInfrastructureAgent,
    private readonly realEstate: RealEstateAnalyticsAgent,
  ) {
    this.register(leadManager);
    this.register(itInfra);
    this.register(realEstate);
    this.logger.log(`Agent Registry initialized: ${this.agents.size} agents registered`);
  }

  private register(agent: OrchestratorAgent): void {
    this.agents.set(agent.name, agent);
  }

  getAgent(name: OrchestratorAgentType): OrchestratorAgent | null {
    return this.agents.get(name) ?? null;
  }

  getCapability(name: OrchestratorAgentType): AgentCapability | null {
    const agent = this.agents.get(name);
    if (!agent) return null;
    return {
      agent: agent.name,
      name: agent.name,
      description: agent.description,
      domains: agent.domains,
      tools: [],
      riskLevel: agent.riskLevel,
      requiresApproval: agent.requiresApproval,
    };
  }

  getAllAgents(): OrchestratorAgent[] {
    return [...this.agents.values()];
  }

  getCapabilitySummary(): string {
    return this.getAllAgents().map(a =>
      `- ${a.name}: ${a.description} (domains: ${a.domains.join(', ')})`
    ).join('\n');
  }
}
