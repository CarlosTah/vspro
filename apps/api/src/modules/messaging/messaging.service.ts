import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../database/prisma.service';
import { IncomingMessage, ChannelType } from '@vspro/shared';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly metaBaseUrl = 'https://graph.facebook.com/v19.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ─── Parseo de mensajes entrantes ────────────────────────────

  /**
   * Parsea el payload de Meta (WhatsApp, Messenger o Instagram)
   * y retorna un IncomingMessage normalizado.
   * Retorna null si el payload no contiene un mensaje procesable.
   */
  parseIncoming(payload: any): IncomingMessage | null {
    try {
      const object = payload?.object;

      if (object === 'whatsapp_business_account') {
        return this.parseWhatsApp(payload);
      }

      if (object === 'page' || object === 'instagram') {
        return this.parseMessengerOrInstagram(payload, object);
      }

      return null;
    } catch (error) {
      this.logger.error('Error parseando payload de Meta:', error);
      return null;
    }
  }

  private parseWhatsApp(payload: any): IncomingMessage | null {
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];

    if (!msg) return null; // puede ser un status update, no un mensaje

    const contact = value?.contacts?.[0];

    return {
      channelType: 'whatsapp',
      senderId: msg.from,
      senderName: contact?.profile?.name,
      messageId: msg.id,
      type: msg.type ?? 'text',
      text: msg.text?.body ?? undefined,
      mediaUrl: msg.image?.id
        ? `${this.metaBaseUrl}/${msg.image.id}`
        : msg.document?.id
        ? `${this.metaBaseUrl}/${msg.document.id}`
        : msg.audio?.id
        ? `${this.metaBaseUrl}/${msg.audio.id}`
        : msg.voice?.id
        ? `${this.metaBaseUrl}/${msg.voice.id}`
        : undefined,
      timestamp: new Date(parseInt(msg.timestamp) * 1000),
      raw: payload,
    };
  }

  private parseMessengerOrInstagram(
    payload: any,
    object: string,
  ): IncomingMessage | null {
    const messaging = payload?.entry?.[0]?.messaging?.[0];
    if (!messaging?.message) return null;

    const channelType: ChannelType =
      object === 'instagram' ? 'instagram' : 'messenger';

    return {
      channelType,
      senderId: messaging.sender.id,
      messageId: messaging.message.mid,
      type: messaging.message.attachments ? 'image' : 'text',
      text: messaging.message.text ?? undefined,
      mediaUrl: messaging.message.attachments?.[0]?.payload?.url ?? undefined,
      timestamp: new Date(messaging.timestamp),
      raw: payload,
    };
  }

  // ─── Envío de mensajes ────────────────────────────────────────

  async sendText(
    channelType: ChannelType,
    recipientId: string,
    text: string,
    schemaName: string,
  ): Promise<void> {
    const channel = await this.getActiveChannel(channelType, schemaName);

    if (!channel) {
      this.logger.warn(
        `No hay canal ${channelType} activo para schema ${schemaName}`,
      );
      return;
    }

    try {
      if (channelType === 'whatsapp') {
        await this.sendWhatsAppText(
          channel.external_id,
          channel.access_token,
          recipientId,
          text,
        );
      } else {
        await this.sendMessengerText(
          channel.access_token,
          recipientId,
          text,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `Error enviando mensaje ${channelType} a ${recipientId}:`,
        error?.response?.data ?? error.message,
      );
    }
  }

  private async sendWhatsAppText(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    text: string,
  ): Promise<void> {
    await axios.post(
      `${this.metaBaseUrl}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
  }

  private async sendMessengerText(
    accessToken: string,
    recipientId: string,
    text: string,
  ): Promise<void> {
    await axios.post(
      `${this.metaBaseUrl}/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text },
        messaging_type: 'RESPONSE',
      },
      {
        params: { access_token: accessToken },
      },
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async getActiveChannel(channelType: ChannelType, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT external_id, access_token
      FROM "${schemaName}".channels
      WHERE type = $1 AND is_active = true
      LIMIT 1
    `, channelType);

    return rows[0] ?? null;
  }

  // ─── Media Sending ────────────────────────────────────────────

  /**
   * Upload media to Meta and send it to a WhatsApp recipient.
   * Supports: image, document, audio.
   */
  async sendMedia(
    channelType: ChannelType,
    recipientId: string,
    mediaBuffer: Buffer,
    mimeType: string,
    filename: string,
    schemaName: string,
    caption?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const channel = await this.getActiveChannel(channelType, schemaName);
    if (!channel) return { success: false, error: `No hay canal ${channelType} activo` };

    try {
      if (channelType === 'whatsapp') {
        // 1. Upload media to Meta
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('file', mediaBuffer, { filename, contentType: mimeType });
        form.append('type', mimeType);

        const uploadRes = await axios.post(
          `${this.metaBaseUrl}/${channel.external_id}/media`,
          form,
          { headers: { Authorization: `Bearer ${channel.access_token}`, ...form.getHeaders() } },
        );

        const mediaId = uploadRes.data?.id;
        if (!mediaId) return { success: false, error: 'No se pudo subir el archivo a Meta' };

        // 2. Determine media type for WhatsApp
        let waType: string;
        let mediaPayload: any;

        if (mimeType.startsWith('image/')) {
          waType = 'image';
          mediaPayload = { id: mediaId, caption: caption ?? '' };
        } else if (mimeType.startsWith('audio/')) {
          waType = 'audio';
          mediaPayload = { id: mediaId };
        } else {
          waType = 'document';
          mediaPayload = { id: mediaId, filename, caption: caption ?? '' };
        }

        // 3. Send message with media
        await axios.post(
          `${this.metaBaseUrl}/${channel.external_id}/messages`,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipientId,
            type: waType,
            [waType]: mediaPayload,
          },
          { headers: { Authorization: `Bearer ${channel.access_token}` } },
        );

        return { success: true };
      }

      return { success: false, error: 'Envío de media solo soportado para WhatsApp' };
    } catch (error: any) {
      this.logger.error(`Error enviando media a ${recipientId}:`, error?.response?.data ?? error.message);
      return { success: false, error: error?.response?.data?.error?.message ?? error.message };
    }
  }
}
