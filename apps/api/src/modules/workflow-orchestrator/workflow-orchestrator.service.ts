import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma.service';
import { WorkflowEvent, WorkflowInstance, WorkflowStatus } from '@vspro/shared';

/**
 * Workflow Orchestrator Service — Manages workflow instances and state.
 *
 * Responsibilities:
 * - Create/update workflow instances in tenant schema (JSONB state)
 * - Route events to appropriate module handlers
 * - Track workflow execution history
 * - Provide REST API for workflow monitoring
 *
 * Integrated modules:
 * - intelligent-scheduling: appointments, reminders, calendar sync
 * - win-back-automation: campaigns, re-engagement, metrics tracking
 */
@Injectable()
export class WorkflowOrchestratorService {
  private readonly logger = new Logger(WorkflowOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('workflow-orchestrator') private readonly workflowQueue: Queue,
    @InjectQueue('appointment-reminders') private readonly reminderQueue: Queue,
    @InjectQueue('calendar-sync') private readonly calendarSyncQueue: Queue,
  ) {}

  // ─── Workflow Instance Management ─────────────────────────────

  /**
   * Create a new workflow instance in the tenant schema.
   */
  async createWorkflowInstance(
    schemaName: string,
    type: string,
    context: Record<string, any>,
  ): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".workflow_instances
        (type, status, current_step, context, events, started_at)
      VALUES ($1, 'pending', 'init', $2::jsonb, '[]'::jsonb, NOW())
      RETURNING id
    `, type, JSON.stringify(context));

    return rows[0].id;
  }

  /**
   * Update workflow instance status and step.
   */
  async updateWorkflowInstance(
    schemaName: string,
    instanceId: string,
    status: WorkflowStatus,
    currentStep: string,
    context?: Record<string, any>,
  ): Promise<void> {
    const contextUpdate = context
      ? `, context = context || $4::jsonb`
      : '';

    const params: any[] = [status, currentStep, instanceId];
    if (context) params.push(JSON.stringify(context));

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".workflow_instances
      SET status = $1, current_step = $2, updated_at = NOW()${contextUpdate}
      WHERE id = $3::uuid
    `, ...params);
  }

  /**
   * Record an event on a workflow instance.
   */
  async recordEventOnWorkflow(
    schemaName: string,
    instanceId: string,
    event: WorkflowEvent,
    result: 'success' | 'skipped' | 'failed',
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".workflow_instances
      SET events = events || $1::jsonb, updated_at = NOW()
      WHERE id = $2::uuid
    `, JSON.stringify([{
      eventId: event.id,
      type: event.type,
      processedAt: new Date().toISOString(),
      result,
    }]), instanceId);
  }

  // ─── Event Processing ─────────────────────────────────────────

  /**
   * Process a workflow event — called by the BullMQ worker.
   */
  async processEvent(event: WorkflowEvent): Promise<void> {
    const { type, tenantId, schemaName, payload } = event;

    // Validate tenant
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.schemaName !== schemaName) {
      this.logger.error(`Tenant isolation violation in workflow: ${tenantId}`);
      return;
    }

    if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
      this.logger.warn(`Tenant ${tenantId} is ${tenant.status}, skipping workflow event`);
      return;
    }

    // Route to appropriate handler
    switch (type) {
      case 'appointment.created':
        await this.handleAppointmentCreated(schemaName, payload);
        break;
      case 'appointment.cancelled':
        await this.handleAppointmentCancelled(schemaName, payload);
        break;
      case 'appointment.rescheduled':
        await this.handleAppointmentRescheduled(schemaName, payload);
        break;
      case 'appointment.no_show':
        await this.handleAppointmentNoShow(schemaName, payload, tenantId);
        break;
      case 'campaign.executed':
        await this.handleCampaignExecuted(schemaName, payload);
        break;
      case 'campaign.customer_converted':
        await this.handleCustomerConverted(schemaName, payload);
        break;
      case 'customer.became_inactive':
        await this.handleCustomerBecameInactive(schemaName, payload, tenantId);
        break;
      default:
        this.logger.debug(`Unhandled workflow event type: ${type}`);
    }
  }

  // ─── Scheduling Event Handlers ────────────────────────────────

  private async handleAppointmentCreated(schemaName: string, payload: Record<string, any>): Promise<void> {
    const { appointmentId, customerId, staffId, startTime, serviceName } = payload;

    // Enqueue reminders (24h + 1h before)
    const startDate = new Date(startTime);
    const now = Date.now();

    const reminderIntervals = [24, 1]; // hours before appointment

    for (const hours of reminderIntervals) {
      const reminderTime = new Date(startDate.getTime() - hours * 3600000);
      if (reminderTime.getTime() > now) {
        const delay = reminderTime.getTime() - now;
        await this.reminderQueue.add('send-reminder', {
          schemaName,
          appointmentId,
          customerId,
          staffId,
          startTime,
          serviceName,
          reminderType: `${hours}h_before`,
        }, {
          delay,
          jobId: `reminder-${appointmentId}-${hours}h`,
        });
      }
    }

    // Enqueue calendar sync
    await this.calendarSyncQueue.add('create-event', {
      schemaName,
      appointmentId,
      staffId,
      action: 'create',
    });

    this.logger.debug(`[${schemaName}] Appointment workflows triggered: ${appointmentId}`);
  }

  private async handleAppointmentCancelled(schemaName: string, payload: Record<string, any>): Promise<void> {
    const { appointmentId, staffId } = payload;

    // Cancel pending reminders
    const jobs = await this.reminderQueue.getJobs(['delayed', 'waiting']);
    for (const job of jobs) {
      if (job.data?.appointmentId === appointmentId) {
        await job.remove();
      }
    }

    // Sync cancellation to Google Calendar
    await this.calendarSyncQueue.add('delete-event', {
      schemaName,
      appointmentId,
      staffId,
      action: 'delete',
    });

    this.logger.debug(`[${schemaName}] Appointment cancelled workflows: ${appointmentId}`);
  }

  private async handleAppointmentRescheduled(schemaName: string, payload: Record<string, any>): Promise<void> {
    const { appointmentId, staffId, newStartTime, customerId, serviceName } = payload;

    // Cancel old reminders
    const jobs = await this.reminderQueue.getJobs(['delayed', 'waiting']);
    for (const job of jobs) {
      if (job.data?.appointmentId === appointmentId) {
        await job.remove();
      }
    }

    // Enqueue new reminders
    await this.handleAppointmentCreated(schemaName, {
      appointmentId,
      customerId,
      staffId,
      startTime: newStartTime,
      serviceName,
    });

    // Sync update to Google Calendar
    await this.calendarSyncQueue.add('update-event', {
      schemaName,
      appointmentId,
      staffId,
      action: 'update',
    });
  }

  private async handleAppointmentNoShow(schemaName: string, payload: Record<string, any>, tenantId: string): Promise<void> {
    const { appointmentId, customerId } = payload;

    // Check if customer has multiple no-shows → trigger retention campaign
    const noShows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) AS count FROM "${schemaName}".appointments
      WHERE customer_id = $1::uuid AND status = 'no_show'
    `, customerId);

    const count = parseInt(noShows[0]?.count ?? '0');
    if (count >= 2) {
      // Emit event to trigger win-back evaluation
      await this.workflowQueue.add('workflow-event', {
        type: 'workflow-event',
        tenantId,
        schemaName,
        event: {
          id: `auto-${Date.now()}`,
          type: 'customer.became_inactive',
          tenantId,
          schemaName,
          payload: { customerId, reason: 'repeated_no_show', noShowCount: count },
          metadata: { source: 'scheduling' },
          createdAt: new Date().toISOString(),
        },
      });
    }
  }

  // ─── Retention Event Handlers ─────────────────────────────────

  private async handleCampaignExecuted(schemaName: string, payload: Record<string, any>): Promise<void> {
    const { campaignId, targetCount, executionId } = payload;

    // Update campaign metrics
    this.logger.log(`[${schemaName}] Campaign ${campaignId} executed: ${targetCount} targets, execution ${executionId}`);
  }

  private async handleCustomerConverted(schemaName: string, payload: Record<string, any>): Promise<void> {
    const { campaignId, customerId, orderId, revenue } = payload;

    // Update campaign contact log with conversion
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".campaign_contact_logs
      SET status = 'converted', converted_at = NOW(), revenue_amount = $1
      WHERE campaign_id = $2::uuid AND customer_id = $3::uuid AND status = 'sent'
      ORDER BY sent_at DESC LIMIT 1
    `, revenue, campaignId, customerId);

    // Update campaign aggregate metrics
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".retention_campaigns
      SET metrics = jsonb_set(
        jsonb_set(
          metrics,
          '{total_converted}',
          to_jsonb(COALESCE((metrics->>'total_converted')::int, 0) + 1)
        ),
        '{revenue_recovered}',
        to_jsonb(COALESCE((metrics->>'revenue_recovered')::decimal, 0) + $1)
      ), updated_at = NOW()
      WHERE id = $2::uuid
    `, revenue, campaignId);

    this.logger.log(`[${schemaName}] Conversion tracked: campaign ${campaignId}, customer ${customerId}, revenue $${revenue}`);
  }

  private async handleCustomerBecameInactive(schemaName: string, payload: Record<string, any>, tenantId: string): Promise<void> {
    const { customerId, reason } = payload;

    // Check if there's an active win-back campaign targeting this customer's segment
    // This is handled by the WinBackWorker when it runs — just log for now
    this.logger.log(`[${schemaName}] Customer ${customerId} became inactive: ${reason}`);
  }

  // ─── Query Methods (for REST API) ────────────────────────────

  /**
   * Get workflow instances with pagination.
   */
  async getWorkflowInstances(
    schemaName: string,
    options: { status?: WorkflowStatus; type?: string; limit?: number; offset?: number },
  ): Promise<{ data: WorkflowInstance[]; total: number }> {
    const { status, type, limit = 20, offset = 0 } = options;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
      whereClause += ` AND status = $${paramIdx++}`;
      params.push(status);
    }
    if (type) {
      whereClause += ` AND type = $${paramIdx++}`;
      params.push(type);
    }

    const countRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS total FROM "${schemaName}".workflow_instances ${whereClause}`,
      ...params,
    );

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "${schemaName}".workflow_instances ${whereClause}
       ORDER BY started_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      ...params, limit, offset,
    );

    return {
      data: rows,
      total: parseInt(countRows[0]?.total ?? '0'),
    };
  }

  /**
   * Get recent workflow events for a tenant (last 50).
   */
  async getRecentEvents(schemaName: string, limit = 50): Promise<any[]> {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM "${schemaName}".workflow_events
      ORDER BY created_at DESC LIMIT $1
    `, limit);
  }
}
