import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Service for managing follow-up scheduling and proactive outreach state.
 */
@Injectable()
export class ProactivityService {
  private readonly logger = new Logger(ProactivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Schedule a follow-up for a conversation.
   * Called by the AI via the schedule_follow_up tool.
   */
  async scheduleFollowUp(
    conversationId: string,
    delayHours: number,
    reason: string,
    schemaName: string,
  ): Promise<{ scheduledAt: string }> {
    if (delayHours < 1 || delayHours > 168) {
      throw new BadRequestException('delay_hours must be between 1 and 168 (7 days)');
    }

    const scheduledAt = new Date(Date.now() + delayHours * 60 * 60 * 1000);

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET next_follow_up_at = $1,
          context = jsonb_set(
            COALESCE(context, '{}'::jsonb),
            '{follow_up_reason}',
            $2::jsonb
          )
      WHERE id = $3::uuid
    `, scheduledAt.toISOString(), JSON.stringify(reason), conversationId);

    this.logger.debug(
      `Follow-up scheduled for conversation ${conversationId} at ${scheduledAt.toISOString()} (${reason})`,
    );

    return { scheduledAt: scheduledAt.toISOString() };
  }

  /**
   * Clear a pending follow-up (e.g., when customer sends a new message).
   */
  async clearFollowUp(conversationId: string, schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET next_follow_up_at = NULL
      WHERE id = $1::uuid AND next_follow_up_at IS NOT NULL
    `, conversationId);
  }

  /**
   * Cancel a follow-up from the dashboard.
   */
  async cancelFollowUp(conversationId: string, schemaName: string): Promise<void> {
    await this.clearFollowUp(conversationId, schemaName);
  }

  /**
   * Get all pending follow-ups for a tenant (dashboard).
   */
  async getPendingFollowUps(schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT c.id, c.next_follow_up_at AS "scheduledAt",
             c.channel_type AS "channelType",
             c.context->>'follow_up_reason' AS reason,
             cu.name AS "customerName", cu.phone AS "customerPhone"
      FROM "${schemaName}".conversations c
      JOIN "${schemaName}".customers cu ON cu.id = c.customer_id
      WHERE c.next_follow_up_at IS NOT NULL
        AND c.status = 'active'
      ORDER BY c.next_follow_up_at ASC
    `);
  }

  /**
   * Check if a proactive message was already sent within the last 24h.
   */
  async canSendProactive(conversationId: string, schemaName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT last_proactive_at FROM "${schemaName}".conversations
      WHERE id = $1::uuid
    `, conversationId);

    if (!rows[0]?.last_proactive_at) return true;

    const lastSent = new Date(rows[0].last_proactive_at);
    const hoursSince = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60);
    return hoursSince >= 24;
  }

  /**
   * Record that a proactive message was sent.
   */
  async recordProactiveSent(conversationId: string, schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET last_proactive_at = NOW()
      WHERE id = $1::uuid
    `, conversationId);
  }

  /**
   * Check if the 24h messaging window is still open.
   */
  async isWithinMessagingWindow(conversationId: string, schemaName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT last_message_at FROM "${schemaName}".conversations
      WHERE id = $1::uuid
    `, conversationId);

    if (!rows[0]?.last_message_at) return false;

    const lastMsg = new Date(rows[0].last_message_at);
    const hoursSince = (Date.now() - lastMsg.getTime()) / (1000 * 60 * 60);
    return hoursSince <= 24;
  }
}
