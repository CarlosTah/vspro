import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  MessagingChannel,
  ChannelType,
  SendTextParams,
  SendTemplateParams,
  SendMediaParams,
  SendResult,
  ChannelConfig,
} from './channel.interface';

/**
 * WhatsApp Business Cloud API Channel.
 * Handles outbound messaging via Meta's Graph API v18.0+.
 */
@Injectable()
export class WhatsAppChannel implements MessagingChannel {
  private readonly logger = new Logger(WhatsAppChannel.name);
  private readonly apiVersion = 'v18.0';
  private readonly baseUrl = 'https://graph.facebook.com';

  readonly type: ChannelType = 'whatsapp';

  constructor(private readonly config: ConfigService) {}

  async sendText(params: SendTextParams): Promise<SendResult> {
    const { recipientId, text, channelConfig } = params;

    const url = `${this.baseUrl}/${this.apiVersion}/${channelConfig.externalId}/messages`;

    try {
      const response = await axios.post(url, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientId,
        type: 'text',
        text: { preview_url: false, body: text },
      }, {
        headers: {
          Authorization: `Bearer ${channelConfig.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const messageId = response.data?.messages?.[0]?.id;
      this.logger.debug(`WhatsApp text sent to ${recipientId}: ${messageId}`);

      return { success: true, messageId };
    } catch (err: any) {
      const error = err.response?.data?.error?.message ?? err.message;
      this.logger.error(`WhatsApp send failed to ${recipientId}: ${error}`);
      return { success: false, error };
    }
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendResult> {
    const { recipientId, templateName, language, components, channelConfig } = params;

    const url = `${this.baseUrl}/${this.apiVersion}/${channelConfig.externalId}/messages`;

    try {
      const response = await axios.post(url, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientId,
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          components: components ?? [],
        },
      }, {
        headers: {
          Authorization: `Bearer ${channelConfig.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const messageId = response.data?.messages?.[0]?.id;
      return { success: true, messageId };
    } catch (err: any) {
      const error = err.response?.data?.error?.message ?? err.message;
      this.logger.error(`WhatsApp template send failed: ${error}`);
      return { success: false, error };
    }
  }

  async sendMedia(params: SendMediaParams): Promise<SendResult> {
    const { recipientId, mediaType, mediaUrl, caption, channelConfig } = params;

    const url = `${this.baseUrl}/${this.apiVersion}/${channelConfig.externalId}/messages`;

    const mediaPayload: any = { link: mediaUrl };
    if (caption) mediaPayload.caption = caption;

    try {
      const response = await axios.post(url, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientId,
        type: mediaType,
        [mediaType]: mediaPayload,
      }, {
        headers: {
          Authorization: `Bearer ${channelConfig.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const messageId = response.data?.messages?.[0]?.id;
      return { success: true, messageId };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error?.message ?? err.message };
    }
  }

  async markAsRead(messageId: string, channelConfig: ChannelConfig): Promise<void> {
    const url = `${this.baseUrl}/${this.apiVersion}/${channelConfig.externalId}/messages`;

    try {
      await axios.post(url, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }, {
        headers: { Authorization: `Bearer ${channelConfig.accessToken}` },
      });
    } catch {
      // Non-critical — don't throw
    }
  }
}
