import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AgentSupervisorService } from './agent-supervisor.service';
import { AgentOrchestratorController } from './agent-orchestrator.controller';
import { LeadManagerAgent } from './agents/lead-manager.agent';
import { ItInfrastructureAgent } from './agents/it-infrastructure.agent';
import { RealEstateAnalyticsAgent } from './agents/real-estate-analytics.agent';
import { AgentRegistryService } from './agent-registry.service';
import { HumanAuditModule } from '../human-audit/human-audit.module';

/**
 * Agent Orchestrator Module — Multi-Agent System with Supervisor Pattern.
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────┐
 * │  Supervisor (AgentSupervisorService)             │
 * │  - Receives tasks from admin/system              │
 * │  - Routes to specialized agent                   │
 * │  - Validates output quality                      │
 * │  - Enforces audit layer (human approval)         │
 * │  - Handles retries and escalation                │
 * ├──────────────────────────────────────────────────┤
 * │  Agent Registry                                  │
 * │  - lead-manager: CRM pipeline, follow-ups        │
 * │  - it-infrastructure: health, deploys, alerts    │
 * │  - real-estate-analytics: occupancy, revenue     │
 * │  - (existing: sales, inventory, finance, etc.)   │
 * ├──────────────────────────────────────────────────┤
 * │  Communication: WorkflowEventBus (event-driven)  │
 * │  Persistence: JSONB sessions in tenant schema    │
 * │  Audit: HumanAuditService (approval workflow)    │
 * └──────────────────────────────────────────────────┘
 */
@Module({
  imports: [
    HumanAuditModule,
    BullModule.registerQueue({
      name: 'agent-tasks',
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
  ],
  controllers: [AgentOrchestratorController],
  providers: [
    AgentSupervisorService,
    AgentRegistryService,
    LeadManagerAgent,
    ItInfrastructureAgent,
    RealEstateAnalyticsAgent,
  ],
  exports: [AgentSupervisorService, AgentRegistryService],
})
export class AgentOrchestratorModule {}
