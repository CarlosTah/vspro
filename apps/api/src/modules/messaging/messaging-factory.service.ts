import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  MessagingChannel,
  ChannelType,
  ChannelConfig,
  SendResult,
} from './channels/channel.interface';
import { WhatsAppChannel } from './channels/whatsapp.channel';
import { MessengerChannel } from './channels/messenger.channel';
import { InstagramChannel } from './channels/instagram.channel';

/**
 * MessagingFactory — Dynamic channel routing.
 * Resolves the correct messaging channel adapter based on channel type
 * and tenant configuration. Provides a unified send interface.
 *
 * Pattern: Abstract Factory + Strategy
 */
@Injectable()
export class MessagingFactory {
  private readonly logger = new Logger(MessagingFactory.name);
  private readonly channels: Map<ChannelType, MessagingChannel>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappChannel: WhatsAppChannel,
    private readonly messengerChannel: MessengerChannel,
    private readonly instagramChannel: InstagramChannel,
  ) {
    this.channels = new Map<ChannelType, MessagingChannel>([
      ['whatsapp', this.whatsappChannel],
      ['messenger', this.messengerChannel],
      ['instagram', this.instagramChannel],
    ]);
  }

  /**
   * Get the channel adapter for a given type.
   */
  getChannel(type: ChannelType): MessagingChannel | null {
    return this.channels.get(type) ?? null;
  }

  /**
   * Send a text message through the appropriate channel.
   * Resolves channel config from the tenant schema.
   */
  async sendText(
    recipientId: string,
    text: string,
    channelType: ChannelType,
    schemaName: string,
  ): Promise<SendResult> {
    const channel = this.getChannel(channelType);
    if (!channel) {
      this.logger.warn(`Channel type '${channelType}' not supported`);
      return { success: false, error: `Channel '${channelType}' not supported` };
    }

    const config = await this.getChannelConfig(channelType, schemaName);
    if (!config) {
      this.logger.warn(`No ${channelType} channel configured for schema ${schemaName}`);
      return { success: false, error: `No ${channelType} channel configured` };
    }

    return channel.sendText({ recipientId, text, channelConfig: config });
  }

  /**
   * Send a template message (for outside 24h window).
   */
  async sendTemplate(
    recipientId: string,
    templateName: string,
    language: string,
    channelType: ChannelType,
    schemaName: string,
    components?: any[],
  ): Promise<SendResult> {
    const channel = this.getChannel(channelType);
    if (!channel) return { success: false, error: `Channel '${channelType}' not supported` };

    const config = await this.getChannelConfig(channelType, schemaName);
    if (!config) return { success: false, error: `No ${channelType} channel configured` };

    return channel.sendTemplate({ recipientId, templateName, language, components, channelConfig: config });
  }

  /**
   * Send a reply in the context of a conversation.
   * Resolves recipient and channel from the conversation record.
   */
  async replyToConversation(
    conversationId: string,
    text: string,
    schemaName: string,
  ): Promise<SendResult> {
    // Get conversation details
    const convs = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT c.channel_type, c.customer_id,
             cu.channel_id AS recipient_id
      FROM "${schemaName}".conversations c
      JOIN "${schemaName}".customers cu ON cu.id = c.customer_id
      WHERE c.id = $1::uuid
    `, conversationId);

    if (!convs[0]) {
      return { success: false, error: 'Conversation not found' };
    }

    const { channel_type, recipient_id } = convs[0];
    return this.sendText(recipient_id, text, channel_type, schemaName);
  }

  /**
   * Get available channel types for a tenant.
   */
  async getConfiguredChannels(schemaName: string): Promise<ChannelType[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT type FROM "${schemaName}".channels WHERE is_active = true
    `);
    return rows.map(r => r.type as ChannelType);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async getChannelConfig(type: ChannelType, schemaName: string): Promise<ChannelConfig | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT type, external_id AS "externalId",
             access_token AS "accessToken",
             webhook_verify_token AS "webhookVerifyToken"
      FROM "${schemaName}".channels
      WHERE type = $1 AND is_active = true
      LIMIT 1
    `, type);

    if (!rows[0]) return null;

    return {
      type: rows[0].type,
      externalId: rows[0].externalId,
      accessToken: rows[0].accessToken,
      webhookVerifyToken: rows[0].webhookVerifyToken,
    };
  }
}
