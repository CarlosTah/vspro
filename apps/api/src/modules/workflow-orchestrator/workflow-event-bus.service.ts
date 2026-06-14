import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { randomUUID } from 'crypto';
import { WorkflowEvent, WorkflowEventType, WorkflowMetadata } from '@vspro/shared';
import { EventsGateway } from '../events/events.gateway';

type EventHandler = (event: WorkflowEvent) => Promise<void>;

/**
 * Workflow Event Bus — Decoupled event-driven communication.
 *
 * Modules emit events (e.g., appointment.created, campaign.executed)
 * and the orchestrator routes them to:
 * 1. Registered in-process handlers (sync)
 * 2. BullMQ queue for async workflow processing
 * 3. WebSocket for real-time dashboard updates
 *
 * Pattern: Observer + Mediator
 */
@Injectable()
export class WorkflowEventBus {
  private readonly logger = new Logger(WorkflowEventBus.name);
  private readonly handlers = new Map<WorkflowEventType, EventHandler[]>();

  constructor(
    @InjectQueue('workflow-orchestrator') private readonly workflowQueue: Queue,
    private readonly eventsGateway: EventsGateway,
  ) {}

  /**
   * Register a handler for a specific event type.
   * Handlers are called synchronously in-process before async queue dispatch.
   */
  on(eventType: WorkflowEventType, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
    this.logger.debug(`Handler registered for: ${eventType}`);
  }

  /**
   * Emit a workflow event.
   * 1. Calls registered sync handlers
   * 2. Enqueues for async workflow processing
   * 3. Pushes to WebSocket for dashboard
   */
  async emit(
    type: WorkflowEventType,
    tenantId: string,
    schemaName: string,
    payload: Record<string, any>,
    metadata?: Partial<WorkflowMetadata>,
  ): Promise<string> {
    const event: WorkflowEvent = {
      id: randomUUID(),
      type,
      tenantId,
      schemaName,
      payload,
      metadata: {
        source: metadata?.source ?? 'system',
        correlationId: metadata?.correlationId ?? randomUUID(),
        causationId: metadata?.causationId,
        userId: metadata?.userId,
        customerId: metadata?.customerId,
      },
      createdAt: new Date().toISOString(),
    };

    // 1. Sync handlers (non-blocking — errors logged, not thrown)
    const handlers = this.handlers.get(type) ?? [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err: any) {
        this.logger.error(`Handler failed for ${type}: ${err.message}`);
      }
    }

    // 2. Async workflow queue
    await this.workflowQueue.add('workflow-event', {
      type: 'workflow-event',
      tenantId,
      schemaName,
      event,
    }, {
      jobId: `wf-${event.id}`,
      priority: this.getEventPriority(type),
    });

    // 3. Real-time WebSocket notification
    this.eventsGateway.emitToTenant(tenantId, 'workflow:event', {
      type,
      payload: this.sanitizePayload(payload),
      timestamp: event.createdAt,
    });

    this.logger.debug(`Event emitted: ${type} [${event.id}] for tenant ${tenantId}`);
    return event.id;
  }

  /**
   * Emit without async queue — for lightweight notifications only.
   */
  notify(tenantId: string, type: WorkflowEventType, payload: Record<string, any>): void {
    this.eventsGateway.emitToTenant(tenantId, 'workflow:event', {
      type,
      payload: this.sanitizePayload(payload),
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private getEventPriority(type: WorkflowEventType): number {
    // Lower number = higher priority
    if (type.startsWith('appointment.')) return 1;
    if (type.startsWith('campaign.')) return 2;
    if (type.startsWith('customer.')) return 3;
    return 5;
  }

  private sanitizePayload(payload: Record<string, any>): Record<string, any> {
    // Remove sensitive fields before sending to WebSocket
    const { accessToken, refreshToken, password, ...safe } = payload;
    return safe;
  }
}
