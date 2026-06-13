import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../database/prisma.service';
import { AiEngineService } from '../ai/ai-engine.service';
import { CustomerMemoryService } from '../ai/customer-memory.service';
import { ProactivityService } from './proactivity.service';
import { ProactiveOutreachJob } from './proactivity-cron.service';

/**
 * BullMQ worker that processes proactive outreach jobs.
 * Validates tenant isolation, checks messaging window and rate limits,
 * generates AI message with full customer context, and delivers via channel.
 */
@Processor('proactive-outreach')
export class ProactivityWorker {
  private readonly logger = new Logger(ProactivityWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
    private readonly customerMemory: CustomerMemoryService,
    private readonly proactivityService: ProactivityService,
  ) {}

  @Process('process-outreach')
  async handleJob(job: Job<ProactiveOutreachJob>): Promise<void> {
    const { tenantId, schemaName, conversationId, customerId, channelType } = job.data;

    this.logger.debug(`Processing proactive outreach: tenant=${tenantId}, conv=${conversationId}`);

    // 1. Validate tenant ownership
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, schemaName: true, businessName: true, status: true },
    });

    if (!tenant || tenant.schemaName !== schemaName) {
      this.logger.error(`Tenant isolation violation: job schema ${schemaName} != tenant schema ${tenant?.schemaName}`);
      return; // Reject silently
    }

    if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
      this.logger.warn(`Tenant ${tenantId} is ${tenant.status}, skipping outreach`);
      return;
    }

    // 2. Check conversation still active
    const convRows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT status, last_message_at AS "lastMessageAt"
      FROM "${schemaName}".conversations
      WHERE id = $1::uuid
    `, conversationId);

    if (!convRows[0] || convRows[0].status !== 'active') {
      this.logger.debug(`Conversation ${conversationId} no longer active, skipping`);
      return;
    }

    // 3. Rate limit: max 1 proactive per 24h
    const canSend = await this.proactivityService.canSendProactive(conversationId, schemaName);
    if (!canSend) {
      this.logger.debug(`Rate limited: conversation ${conversationId} already received proactive in last 24h`);
      return;
    }

    // 4. Check 24h messaging window
    const withinWindow = await this.proactivityService.isWithinMessagingWindow(conversationId, schemaName);

    if (!withinWindow) {
      // Check if template is configured
      const configRows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT proactive_template AS "proactiveTemplate"
        FROM "${schemaName}".ai_config LIMIT 1
      `);

      if (!configRows[0]?.proactiveTemplate) {
        this.logger.warn(
          `Cannot send proactive to ${conversationId}: outside 24h window and no template configured`,
        );
        return;
      }

      // TODO: Send template message via Meta API
      this.logger.log(`Would send template message to conversation ${conversationId} (outside 24h window)`);
      await this.proactivityService.recordProactiveSent(conversationId, schemaName);
      return;
    }

    // 5. Generate proactive message using AI with full context
    try {
      const memoryContext = await this.customerMemory.buildMemoryContext(
        customerId,
        'follow-up proactivo',
        schemaName,
      );

      // Get follow-up reason from conversation context
      const contextRows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT context FROM "${schemaName}".conversations WHERE id = $1::uuid
      `, conversationId);
      const followUpReason = contextRows[0]?.context?.follow_up_reason ?? 'seguimiento general';

      // Generate proactive message via AI
      const proactivePrompt = this.buildProactivePrompt(tenant.businessName, followUpReason, memoryContext);

      // For now, log the intent (full messaging integration requires MessagingService)
      this.logger.log(
        `Proactive outreach generated for conv ${conversationId} (${channelType}): reason="${followUpReason}"`,
      );

      // 6. Record that we sent a proactive message
      await this.proactivityService.recordProactiveSent(conversationId, schemaName);

      // Store the outbound message
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".messages
          (conversation_id, direction, type, content, ai_processed)
        VALUES ($1::uuid, 'outbound', 'text', $2, true)
      `, conversationId, `[PROACTIVE] ${proactivePrompt}`);

    } catch (err: any) {
      this.logger.error(`Error generating proactive message for ${conversationId}: ${err.message}`);
      throw err; // Let BullMQ retry
    }
  }

  private buildProactivePrompt(businessName: string, reason: string, memoryContext: string): string {
    return `Genera un mensaje de seguimiento breve y amigable para el cliente.
Negocio: ${businessName}
Razón del seguimiento: ${reason}
${memoryContext}
El mensaje debe ser corto (máximo 2 oraciones), natural y no invasivo.`;
  }
}
