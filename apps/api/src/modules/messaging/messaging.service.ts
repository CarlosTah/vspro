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
}
