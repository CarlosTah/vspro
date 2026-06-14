import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { WorkflowOrchestratorService } from './workflow-orchestrator.service';
import { WorkflowOrchestratorController } from './workflow-orchestrator.controller';
import { WorkflowEventBus } from './workflow-event-bus.service';
import { WorkflowCronService } from './workflow-cron.service';

/**
 * Workflow Orchestrator Module — Event-driven coordination layer.
 *
 * Integrates:
 * - intelligent-scheduling (appointments, reminders, calendar sync)
 * - win-back-automation (campaigns, re-engagement, metrics)
 *
 * Architecture:
 * - Event bus for decoupled module communication
 * - BullMQ queue for reliable async workflow execution
 * - Cron for periodic workflow triggers
 * - JSONB workflow state in tenant schema
 * - REST API for workflow monitoring
 */
@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue(
      {
        name: 'workflow-orchestrator',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 200,
          removeOnFail: 1000,
        },
      },
      {
        name: 'appointment-reminders',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      },
      {
        name: 'calendar-sync',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 50,
          removeOnFail: 200,
        },
      },
    ),
  ],
  controllers: [WorkflowOrchestratorController],
  providers: [
    WorkflowOrchestratorService,
    WorkflowEventBus,
    WorkflowCronService,
  ],
  exports: [WorkflowOrchestratorService, WorkflowEventBus],
})
export class WorkflowOrchestratorModule {}
