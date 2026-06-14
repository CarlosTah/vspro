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
 * Instagram DMs Channel Adapter.
 * Uses the same Meta Graph API as Messenger (Send API).
 *
 * Key differences from Messenger:
 * - Uses IGSID (Instagram-Scoped ID) as recipient
 * - Limited template support (no generic templates in DMs)
 * - Media sharing has restrictions (only images, no carousels in DMs)
 * - Requires Instagram Business/Creator account linked to Facebook Page
 *
 * API: Same as Messenger — POST /me/messages with Instagram Page token.
 */
@Injectable()
export class InstagramChannel implements MessagingChannel {
  private readonly logger = new Logger(InstagramChannel.name);
  private readonly apiVersion = 'v18.0';
  private readonly baseUrl = 'https://graph.facebook.com';

  readonly type: ChannelType = 'instagram';

  constructor(private readonly config: ConfigService) {}

  async sendText(params: SendTextParams): Promise<SendResult> {
    const { recipientId, text, channelConfig } = params;
    const url = `${this.baseUrl}/${this.apiVersion}/me/messages`;

    try {
      const response = await axios.post(url, {
        recipient: { id: recipientId },
        message: { text },
      }, {
        params: { access_token: channelConfig.accessToken },
        headers: { 'Content-Type': 'application/json' },
      });

      const messageId = response.data?.message_id;
      this.logger.debug(`Instagram DM sent to ${recipientId}: ${messageId}`);
      return { success: true, messageId };
    } catch (err: any) {
      const error = err.response?.data?.error?.message ?? err.message;
      this.logger.error(`Instagram DM failed: ${error}`);
      return { success: false, error };
    }
  }

  async sendTemplate(params: SendTemplateParams): Promise<SendResult> {
    // Instagram DMs don't support structured templates like Messenger
    // Fall back to plain text with the template content
    return this.sendText({
      recipientId: params.recipientId,
      text: `${params.templateName}`,
      channelConfig: params.channelConfig,
    });
  }

  async sendMedia(params: SendMediaParams): Promise<SendResult> {
    const { recipientId, mediaType, mediaUrl, caption, channelConfig } = params;

    // Instagram DMs only support image and video attachments
    if (mediaType !== 'image' && mediaType !== 'video') {
      // Send as link in text
      return this.sendText({
        recipientId,
        text: `${caption ?? ''}\n${mediaUrl}`,
        channelConfig,
      });
    }

    const url = `${this.baseUrl}/${this.apiVersion}/me/messages`;

    try {
      const response = await axios.post(url, {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: mediaType,
            payload: { url: mediaUrl },
          },
        },
      }, {
        params: { access_token: channelConfig.accessToken },
      });

      // Send caption as follow-up if provided
      if (caption) {
        await this.sendText({ recipientId, text: caption, channelConfig });
      }

      return { success: true, messageId: response.data?.message_id };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error?.message ?? err.message };
    }
  }

  async markAsRead(messageId: string, channelConfig: ChannelConfig): Promise<void> {
    // Instagram doesn't have a mark_seen API for DMs
    // No-op
  }

  // ─── Instagram-specific: Story replies handling ───────────────

  /**
   * Send an image message (most common for Instagram commerce).
   */
  async sendProductImage(
    recipientId: string,
    imageUrl: string,
    productName: string,
    price: number,
    channelConfig: ChannelConfig,
  ): Promise<SendResult> {
    // Send image
    const imgResult = await this.sendMedia({
      recipientId,
      mediaType: 'image',
      mediaUrl: imageUrl,
      caption: undefined,
      channelConfig,
    });

    if (!imgResult.success) return imgResult;

    // Send product details as text
    await this.sendText({
      recipientId,
      text: `✨ ${productName}\n💰 $${price.toLocaleString()} MXN\n\n¿Te interesa? Dime y te lo aparto 🛒`,
      channelConfig,
    });

    return imgResult;
  }
}
