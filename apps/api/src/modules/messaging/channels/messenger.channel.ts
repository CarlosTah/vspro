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
 * Facebook Messenger Channel Adapter.
 * Handles outbound messaging via Meta's Send API (Graph API v18.0+).
 * Also works for Instagram DMs (same underlying API).
 *
 * Key differences from WhatsApp:
 * - Uses PSID (Page-Scoped ID) instead of phone number
 * - No 24h window — uses messaging_type: RESPONSE/UPDATE/MESSAGE_TAG
 * - Supports quick replies, buttons, generic templates
 * - Same Page Access Token for both Messenger and Instagram
 */
@Injectable()
export class MessengerChannel implements MessagingChannel {
  private readonly logger = new Logger(MessengerChannel.name);
  private readonly apiVersion = 'v18.0';
  private readonly baseUrl = 'https://graph.facebook.com';

  readonly type: ChannelType = 'messenger';

  constructor(private readonly config: ConfigService) {}

  async sendText(params: SendTextParams): Promise<SendResult> {
    const { recipientId, text, channelConfig } = params;

    const url = `${this.baseUrl}/${this.apiVersion}/me/messages`;

    try {
      const response = await axios.post(url, {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text },
      }, {
        headers: {
          Authorization: `Bearer ${channelConfig.accessToken}`,
          'Content-Type': 'application/json',
        },
        params: { access_token: channelConfig.accessToken },
      });

      const messageId = response.data?.message_id;
      this.logger.debug(`Messenger text sent to ${recipientId}: ${messageId}`);
      return { success: true, messageId };
    } catch (err: any) {
      const error = err.response?.data?.error?.message ?? err.message;
      this.logger.error(`Messenger send failed: ${error}`);
      return { success: false, error };
    }
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendResult> {
    const { recipientId, templateName, channelConfig, components } = params;

    // Messenger uses "generic template" format (not WhatsApp templates)
    const url = `${this.baseUrl}/${this.apiVersion}/me/messages`;

    try {
      const response = await axios.post(url, {
        recipient: { id: recipientId },
        messaging_type: 'UPDATE',
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: components ?? [{
                title: templateName,
                subtitle: 'Mensaje de seguimiento',
              }],
            },
          },
        },
      }, {
        headers: { Authorization: `Bearer ${channelConfig.accessToken}` },
        params: { access_token: channelConfig.accessToken },
      });

      return { success: true, messageId: response.data?.message_id };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error?.message ?? err.message };
    }
  }

  async sendMedia(params: SendMediaParams): Promise<SendResult> {
    const { recipientId, mediaType, mediaUrl, caption, channelConfig } = params;

    const url = `${this.baseUrl}/${this.apiVersion}/me/messages`;

    // Messenger media types: image, video, audio, file
    const attachmentType = mediaType === 'document' ? 'file' : mediaType;

    try {
      // Send media
      const mediaResponse = await axios.post(url, {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: {
          attachment: {
            type: attachmentType,
            payload: { url: mediaUrl, is_reusable: true },
          },
        },
      }, {
        headers: { Authorization: `Bearer ${channelConfig.accessToken}` },
        params: { access_token: channelConfig.accessToken },
      });

      // If there's a caption, send it as a follow-up text
      if (caption) {
        await axios.post(url, {
          recipient: { id: recipientId },
          messaging_type: 'RESPONSE',
          message: { text: caption },
        }, {
          headers: { Authorization: `Bearer ${channelConfig.accessToken}` },
          params: { access_token: channelConfig.accessToken },
        });
      }

      return { success: true, messageId: mediaResponse.data?.message_id };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error?.message ?? err.message };
    }
  }

  async markAsRead(messageId: string, channelConfig: ChannelConfig): Promise<void> {
    const url = `${this.baseUrl}/${this.apiVersion}/me/messages`;
    try {
      await axios.post(url, {
        recipient: { id: messageId }, // For Messenger, we need sender_id not message_id
        sender_action: 'mark_seen',
      }, {
        headers: { Authorization: `Bearer ${channelConfig.accessToken}` },
        params: { access_token: channelConfig.accessToken },
      });
    } catch { /* non-critical */ }
  }

  // ─── Messenger-specific features ─────────────────────────────

  /**
   * Send a message with quick reply buttons.
   */
  async sendQuickReplies(
    recipientId: string,
    text: string,
    replies: Array<{ title: string; payload: string }>,
    channelConfig: ChannelConfig,
  ): Promise<SendResult> {
    const url = `${this.baseUrl}/${this.apiVersion}/me/messages`;

    try {
      const response = await axios.post(url, {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: {
          text,
          quick_replies: replies.map(r => ({
            content_type: 'text',
            title: r.title,
            payload: r.payload,
          })),
        },
      }, {
        headers: { Authorization: `Bearer ${channelConfig.accessToken}` },
        params: { access_token: channelConfig.accessToken },
      });

      return { success: true, messageId: response.data?.message_id };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error?.message ?? err.message };
    }
  }

  /**
   * Send a product carousel (generic template with multiple elements).
   */
  async sendProductCarousel(
    recipientId: string,
    products: Array<{ title: string; subtitle: string; imageUrl: string; buttonLabel: string; buttonPayload: string }>,
    channelConfig: ChannelConfig,
  ): Promise<SendResult> {
    const url = `${this.baseUrl}/${this.apiVersion}/me/messages`;

    try {
      const response = await axios.post(url, {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: products.slice(0, 10).map(p => ({
                title: p.title,
                subtitle: p.subtitle,
                image_url: p.imageUrl,
                buttons: [{
                  type: 'postback',
                  title: p.buttonLabel,
                  payload: p.buttonPayload,
                }],
              })),
            },
          },
        },
      }, {
        headers: { Authorization: `Bearer ${channelConfig.accessToken}` },
        params: { access_token: channelConfig.accessToken },
      });

      return { success: true, messageId: response.data?.message_id };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error?.message ?? err.message };
    }
  }
}
