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

    // Strategy: Try template FIRST (always works regardless of 24h window),
    // then fall back to free text if template fails.
    // This ensures delivery even when the conversation window is closed.
    const templateResult = await this.sendUtilityTemplate(recipientId, text, channelConfig);
    if (templateResult.success) {
      return templateResult;
    }

    // Template failed (not approved, format error, etc.) — try free text
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
      const errorMsg = err.response?.data?.error?.message ?? err.message;
      this.logger.error(`WhatsApp send failed to ${recipientId}: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Fallback: send a utility template when outside the 24h conversation window.
   * Uses the 'vspro_notification' template with the message as body parameter.
   * If no custom template exists, tries 'hello_world' (Meta's default approved template).
   */
  private async sendUtilityTemplate(
    recipientId: string,
    text: string,
    channelConfig: ChannelConfig,
  ): Promise<SendResult> {
    const url = `${this.baseUrl}/${this.apiVersion}/${channelConfig.externalId}/messages`;

    // Try custom utility template first
    const templatesToTry = ['vspro_notification', 'vspro_alert', 'hello_world'];

    for (const templateName of templatesToTry) {
      try {
        // For vspro templates, pass the message text as variable {{1}}
        const components = templateName.startsWith('vspro')
          ? [{ type: 'body', parameters: [{ type: 'text', text: text.substring(0, 900) }] }]
          : [];

        const response = await axios.post(url, {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientId,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'es_MX' },
            components,
          },
        }, {
          headers: {
            Authorization: `Bearer ${channelConfig.accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        const messageId = response.data?.messages?.[0]?.id;
        this.logger.log(`WhatsApp template '${templateName}' sent to ${recipientId}: ${messageId}`);
        return { success: true, messageId, templateUsed: templateName };
      } catch (err: any) {
        const errMsg = err.response?.data?.error?.message ?? '';
        // Template not found — try next one
        if (errMsg.includes('template') || errMsg.includes('not found') || errMsg.includes('does not exist')) {
          continue;
        }
        // Other error — break
        this.logger.error(`WhatsApp template '${templateName}' failed: ${errMsg}`);
        break;
      }
    }

    // All templates failed — return original error
    return { success: false, error: 'Outside 24h window and no approved templates available. Create templates in Meta Business Manager.' };
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
