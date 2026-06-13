import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../database/prisma.service';
import { AgentRouterService } from '../ai/agents/agent-router.service';
import { SalesAgent } from '../ai/agents/sales-agent';
import { FinanceAgent } from '../ai/agents/finance-agent';
import { GeneralAgent } from '../ai/agents/general-agent';
import { CustomerMemoryService } from '../ai/customer-memory.service';
import { MessagingFactory } from './messaging-factory.service';
import { AgentContext, AgentConfig, AgentType, DEFAULT_AGENT_CONFIG } from '../ai/agents/types';
import { BaseAgent } from '../ai/agents/base-agent';

interface IncomingMessageJob {
  tenantId: string;
  schemaName: string;
  conversationId: string;
  customerId: string | null;
  messageText: string;
  messageType: string;
  channelType: string;
  tenant: { id: string; slug: string; businessName: string; schemaName: string };
}

/**
 * Refactored MessageWorker — uses AgentRouterService to classify intent
 * and delegate to the appropriate specialized agent.
 *
 * Replaces the previous monolithic AiEngineService.processMessage() call.
 * Maintains strict tenant isolation via schemaName in every operation.
 */
@Processor('messages')
export class MessageWorker {
  private readonly logger = new Logger(MessageWorker.name);
  private readonly agents: Map<AgentType, BaseAgent>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly router: AgentRouterService,
    private readonly customerMemory: CustomerMemoryService,
    private readonly messagingFactory: MessagingFactory,
    private readonly salesAgent: SalesAgent,
    private readonly financeAgent: FinanceAgent,
    private readonly generalAgent: GeneralAgent,
  ) {
    // Register available agents
    this.agents = new Map<AgentType, BaseAgent>([
      ['sales', this.salesAgent],
      ['finance', this.financeAgent],
      ['general', this.generalAgent],
      ['support', this.generalAgent], // Support uses GeneralAgent for now
    ]);
  }

  @Process('process-message')
  async handleMessage(job: Job<IncomingMessageJob>): Promise<void> {
    const { tenantId, schemaName, conversationId, customerId, messageText, tenant } = job.data;

    this.logger.debug(`Processing message for tenant ${tenant.slug}, conv ${conversationId}`);

    // 1. Validate tenant isolation
    const tenantRecord = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { schemaName: true, status: true },
    });

    if (!tenantRecord || tenantRecord.schemaName !== schemaName) {
      this.logger.error(`Tenant isolation violation in MessageWorker: ${tenantId} / ${schemaName}`);
      return;
    }

    if (tenantRecord.status === 'SUSPENDED' || tenantRecord.status === 'CANCELLED') {
      this.logger.warn(`Tenant ${tenantId} is ${tenantRecord.status}, skipping message`);
      return;
    }

    try {
      // 2. Load agent configuration for this tenant
      const agentConfig = await this.loadAgentConfig(schemaName);

      // 3. Load conversation history
      const history = await this.getConversationHistory(conversationId, schemaName);

      // 4. Load conversation context (for order state detection)
      const convContext = await this.getConversationContext(conversationId, schemaName);

      // 5. Build memory context
      const memoryContext = customerId
        ? await this.customerMemory.buildMemoryContext(customerId, messageText, schemaName)
        : '';

      // 6. Route to appropriate agent
      const routeResult = await this.router.route(messageText, convContext, agentConfig);

      this.logger.debug(
        `Routed to ${routeResult.agent} (confidence: ${routeResult.confidence}, source: ${routeResult.source})`,
      );

      // 7. Get agent instance
      const agent = this.agents.get(routeResult.agent) ?? this.generalAgent;

      // 8. Build agent context
      const context: AgentContext = {
        conversationId,
        customerId,
        conversationHistory: history,
        tenant,
        agentConfig,
        schemaName,
        memoryContext,
        orderState: convContext?.orderState,
      };

      // 9. Process message through the agent
      const response = await agent.process(messageText, context, tenant);

      // 10. Save agent context for future routing
      await this.saveAgentContext(conversationId, schemaName, {
        lastAgent: routeResult.agent,
        lastConfidence: routeResult.confidence,
        lastSource: routeResult.source,
        toolsExecuted: response.toolsExecuted ?? [],
      });

      // 11. Store outbound message
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".messages
          (conversation_id, direction, type, content, ai_processed)
        VALUES ($1::uuid, 'outbound', 'text', $2, true)
      `, conversationId, response.text);

      // 12. Send via messaging channel (WhatsApp/Messenger/Instagram)
      const channelType = job.data.channelType as any;
      const customerChannelId = await this.getCustomerChannelId(customerId, schemaName);
      if (customerChannelId) {
        const sendResult = await this.messagingFactory.sendText(
          customerChannelId,
          response.text,
          channelType,
          schemaName,
        );
        if (!sendResult.success) {
          this.logger.warn(`Outbound delivery failed: ${sendResult.error}`);
        }
      }

      // 13. Update conversation last_message_at
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".conversations
        SET last_message_at = NOW()
        WHERE id = $1::uuid
      `, conversationId);

      this.logger.debug(`Response sent via ${routeResult.agent} agent`);

    } catch (err: any) {
      this.logger.error(`Error processing message for conv ${conversationId}: ${err.message}`);
      throw err; // Let BullMQ retry
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async loadAgentConfig(schemaName: string): Promise<AgentConfig> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT agent_config AS "agentConfig" FROM "${schemaName}".ai_config LIMIT 1
    `);
    return (rows[0]?.agentConfig as AgentConfig) ?? DEFAULT_AGENT_CONFIG;
  }

  private async getConversationHistory(conversationId: string, schemaName: string) {
    const messages = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT direction, content FROM "${schemaName}".messages
      WHERE conversation_id = $1::uuid AND type = 'text' AND content IS NOT NULL
      ORDER BY created_at DESC LIMIT 10
    `, conversationId);

    return messages.reverse().map((m: any) => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));
  }

  private async getConversationContext(conversationId: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT context, agent_context AS "agentContext"
      FROM "${schemaName}".conversations WHERE id = $1::uuid
    `, conversationId);

    return {
      id: conversationId,
      ...(rows[0]?.context ?? {}),
      ...(rows[0]?.agentContext ?? {}),
    };
  }

  private async saveAgentContext(
    conversationId: string,
    schemaName: string,
    agentData: Record<string, any>,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET agent_context = $1::jsonb
      WHERE id = $2::uuid
    `, JSON.stringify(agentData), conversationId);
  }

  private async getCustomerChannelId(customerId: string | null, schemaName: string): Promise<string | null> {
    if (!customerId) return null;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT channel_id FROM "${schemaName}".customers WHERE id = $1::uuid`,
      customerId,
    );
    return rows[0]?.channel_id ?? null;
  }
}
