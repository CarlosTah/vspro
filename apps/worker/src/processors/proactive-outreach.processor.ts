import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../database/prisma.service';
import { CustomerMemoryService } from '../services/customer-memory.service';

interface ProactiveJob {
  tenantId: string;
  schemaName: string;
  conversationId: string;
  customerId: string;
  channelType: string;
  scheduledAt: string;
}

@Processor('proactive-outreach')
export class ProactiveOutreachProcessor {
  private readonly logger = new Logger(ProactiveOutreachProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customerMemory: CustomerMemoryService,
  ) {}

  @Process('process-outreach')
  async handle(job: Job<ProactiveJob>): Promise<void> {
    const { tenantId, schemaName, conversationId, customerId } = job.data;

    // Validate tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { schemaName: true, status: true, businessName: true },
    });

    if (!tenant || tenant.schemaName !== schemaName) {
      this.logger.error(`Tenant isolation violation: ${tenantId}`);
      return;
    }

    if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') return;

    // Check conversation still active
    const convs = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT status, last_message_at, last_proactive_at FROM "${schemaName}".conversations WHERE id = $1::uuid`,
      conversationId,
    );

    if (!convs[0] || convs[0].status !== 'active') return;

    // Rate limit: 1 proactive per 24h
    if (convs[0].last_proactive_at) {
      const hoursSince = (Date.now() - new Date(convs[0].last_proactive_at).getTime()) / 3600000;
      if (hoursSince < 24) return;
    }

    // Check 24h messaging window
    if (convs[0].last_message_at) {
      const hoursSinceMsg = (Date.now() - new Date(convs[0].last_message_at).getTime()) / 3600000;
      if (hoursSinceMsg > 24) {
        this.logger.warn(`[${schemaName}] Conv ${conversationId}: outside 24h window, skipping`);
        return;
      }
    } else {
      return; // No last message — can't send proactive
    }

    // Build context and generate message
    const memoryContext = await this.customerMemory.buildMemoryContext(customerId, 'follow-up', schemaName);

    // Store proactive message
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".messages
        (conversation_id, direction, type, content, ai_processed)
      VALUES ($1::uuid, 'outbound', 'text', $2, true)
    `, conversationId, '[PROACTIVE] Mensaje de seguimiento generado');

    // Record sent
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations SET last_proactive_at = NOW() WHERE id = $1::uuid
    `, conversationId);

    this.logger.log(`[${schemaName}] Proactive outreach sent for conv ${conversationId}`);
  }
}
