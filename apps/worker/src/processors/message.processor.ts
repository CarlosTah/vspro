import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../database/prisma.service';
import { CustomerMemoryService } from '../services/customer-memory.service';
import { AgentRouterService } from '../services/agent-router.service';

interface MessageJob {
  tenantId: string;
  schemaName: string;
  conversationId: string;
  customerId: string | null;
  messageText: string;
  channelType: string;
  tenant: { id: string; slug: string; businessName: string; schemaName: string };
}

/**
 * Processes incoming customer messages through the AI agent system.
 * Routes to specialized agents via AgentRouterService.
 */
@Processor('messages')
export class MessageProcessor {
  private readonly logger = new Logger(MessageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerMemory: CustomerMemoryService,
    private readonly router: AgentRouterService,
  ) {}

  @Process('process-message')
  async handle(job: Job<MessageJob>): Promise<void> {
    const { tenantId, schemaName, conversationId, customerId, messageText, tenant } = job.data;

    // Validate tenant
    const tenantRecord = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { schemaName: true, status: true },
    });

    if (!tenantRecord || tenantRecord.schemaName !== schemaName) {
      this.logger.error(`Tenant isolation violation: ${tenantId}`);
      return;
    }

    if (tenantRecord.status === 'SUSPENDED' || tenantRecord.status === 'CANCELLED') {
      return;
    }

    try {
      // Load agent config
      const configRows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT agent_config FROM "${schemaName}".ai_config LIMIT 1`,
      );
      const agentConfig = configRows[0]?.agent_config ?? null;

      // Route message
      const route = await this.router.route(messageText, { id: conversationId }, agentConfig);

      // Build memory context
      const memoryContext = customerId
        ? await this.customerMemory.buildMemoryContext(customerId, messageText, schemaName)
        : '';

      // For now, generate a simple response (full agent.process() requires OpenAI)
      const responseText = `[${route.agent}] Mensaje procesado (confidence: ${route.confidence.toFixed(2)})`;

      // Store outbound message
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".messages
          (conversation_id, direction, type, content, ai_processed)
        VALUES ($1::uuid, 'outbound', 'text', $2, true)
      `, conversationId, responseText);

      this.logger.debug(`[${tenant.slug}] Message processed via ${route.agent} agent`);
    } catch (err: any) {
      this.logger.error(`Message processing failed: ${err.message}`);
      throw err;
    }
  }
}
