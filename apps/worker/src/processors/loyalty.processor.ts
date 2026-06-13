import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../database/prisma.service';

/**
 * Loyalty Retention Processor — Sends re-engagement messages via WhatsApp.
 *
 * Queue: loyalty-retention
 * Jobs:
 * - send-re-engagement: Send personalized message to at-risk/churned customer
 *
 * Uses WhatsApp templates (HSM) for messages outside 24h window.
 * Falls back to free-form text if within window.
 *
 * Tenant isolation: validates schemaName before sending.
 */
@Processor('loyalty-retention')
export class LoyaltyProcessor {
  private readonly logger = new Logger(LoyaltyProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('send-re-engagement')
  async handleReEngagement(job: Job<any>): Promise<void> {
    const {
      tenantId, schemaName, slug, customerId,
      customerName, channelType, channelId,
      action, templateName, message, segment, daysSinceLastOrder,
    } = job.data;

    // 1. Tenant isolation
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.schemaName !== schemaName) {
      this.logger.error(`Tenant isolation violation in loyalty: ${tenantId}`);
      return;
    }

    if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') return;

    // 2. Check if customer still exists and hasn't ordered since job was queued
    const customers = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT c.id, MAX(o.created_at) AS last_order
      FROM "${schemaName}".customers c
      LEFT JOIN "${schemaName}".orders o ON o.customer_id = c.id AND o.status != 'cancelled'
      WHERE c.id = $1::uuid
      GROUP BY c.id
    `, customerId);

    if (!customers[0]) return;

    // If customer ordered today, skip (they came back on their own!)
    const lastOrder = customers[0].last_order ? new Date(customers[0].last_order) : null;
    if (lastOrder && (Date.now() - lastOrder.getTime()) < 86400000) {
      this.logger.debug(`[${slug}] ${customerName} ordered recently — skipping re-engagement`);
      return;
    }

    // 3. Determine if within 24h messaging window
    const conversations = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT last_message_at FROM "${schemaName}".conversations
      WHERE customer_id = $1::uuid AND status = 'active'
      ORDER BY last_message_at DESC LIMIT 1
    `, customerId);

    const lastMessage = conversations[0]?.last_message_at;
    const withinWindow = lastMessage && (Date.now() - new Date(lastMessage).getTime()) < 86400000;

    // 4. Log the re-engagement action
    this.logger.log(
      `[${slug}] Re-engagement: ${customerName} (${segment}, ${daysSinceLastOrder}d inactive) ` +
      `→ ${action} via ${channelType} (${withinWindow ? 'free-form' : 'template'})`,
    );

    // 5. Store the outbound message record
    // Find or create conversation for this customer
    let conversationId: string | null = null;
    const existingConvs = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id FROM "${schemaName}".conversations
      WHERE customer_id = $1::uuid ORDER BY created_at DESC LIMIT 1
    `, customerId);

    if (existingConvs[0]) {
      conversationId = existingConvs[0].id;
    }

    if (conversationId) {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".messages
          (conversation_id, direction, type, content, ai_processed)
        VALUES ($1::uuid, 'outbound', 'text', $2, true)
      `, conversationId, `[RE-ENGAGEMENT:${action}] ${message}`);
    }

    // 6. In production: send via MessagingFactory
    // For now: logged above. When WhatsApp is connected:
    // - withinWindow=true → MessagingFactory.sendText(channelId, message, channelType, schemaName)
    // - withinWindow=false → MessagingFactory.sendTemplate(channelId, templateName, 'es', channelType, schemaName)
  }
}
