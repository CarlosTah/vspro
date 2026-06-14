import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { HumanAuditService } from './human-audit.service';
import { HumanAuditController } from './human-audit.controller';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { AuditTrailService } from './audit-trail.service';

/**
 * Human Audit Layer Module — Enforcement of human-in-the-loop approval.
 *
 * Integrates with WorkflowOrchestratorModule to intercept high-risk
 * operations and require human approval before execution.
 *
 * Features:
 * - Approval Workflow: Configurable rules for what requires human sign-off
 * - Audit Trail: Immutable log of all decisions, approvals, and rejections
 * - WebSocket notifications: Real-time alerts when approval is needed
 * - Time-based escalation: Auto-escalate if no decision within threshold
 *
 * High-risk operations that require approval by default:
 * - Campaign activation (win-back)
 * - Bulk message sends (>50 customers)
 * - Discount >20%
 * - Tenant deprovision
 * - Staff schedule bulk changes
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'human-audit',
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    }),
  ],
  controllers: [HumanAuditController],
  providers: [
    HumanAuditService,
    ApprovalWorkflowService,
    AuditTrailService,
  ],
  exports: [HumanAuditService, ApprovalWorkflowService, AuditTrailService],
})
export class HumanAuditModule {}
