import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ChannelType } from '@vspro/shared';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Consultas ────────────────────────────────────────────────

  async findAll(schemaName: string, status?: string) {
    const where = status ? `WHERE conv.status = $1` : '';
    const params = status ? [status] : [];

    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        conv.id,
        conv.status,
        conv.channel_type       AS "channelType",
        conv.channel_thread_id  AS "channelThreadId",
        conv.last_message_at    AS "lastMessageAt",
        conv.created_at         AS "createdAt",
        c.id                    AS "customerId",
        c.name                  AS "customerName",
        c.channel_id            AS "customerChannelId",
        last_msg.content        AS "lastMessageContent",
        last_msg.direction      AS "lastMessageDirection"
      FROM "${schemaName}".conversations conv
      JOIN "${schemaName}".customers c ON c.id = conv.customer_id
      LEFT JOIN LATERAL (
        SELECT content, direction
        FROM "${schemaName}".messages
        WHERE conversation_id = conv.id
        ORDER BY created_at DESC
        LIMIT 1
      ) last_msg ON true
      ${where}
      ORDER BY conv.last_message_at DESC NULLS LAST
    `, ...params);
  }

  async findById(id: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        conv.id, conv.status, conv.context,
        conv.channel_type      AS "channelType",
        conv.channel_thread_id AS "channelThreadId",
        conv.last_message_at   AS "lastMessageAt",
        conv.created_at        AS "createdAt",
        c.id   AS "customerId",
        c.name AS "customerName",
        c.phone AS "customerPhone",
        c.channel_id AS "customerChannelId"
      FROM "${schemaName}".conversations conv
      JOIN "${schemaName}".customers c ON c.id = conv.customer_id
      WHERE conv.id = $1::uuid
    `, id);

    if (!rows[0]) throw new NotFoundException(`Conversación ${id} no encontrada`);
    return rows[0];
  }

  async getMessages(conversationId: string, schemaName: string, limit = 100) {
    // Get the latest N messages (DESC to get newest first) then reverse for chronological display
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM (
        SELECT
          id, direction, type, content, media_url AS "mediaUrl",
          ai_processed AS "aiProcessed", created_at AS "createdAt"
        FROM "${schemaName}".messages
        WHERE conversation_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT $2
      ) sub
      ORDER BY sub."createdAt" ASC
    `, conversationId, limit);
  }

  // ─── Gestión de conversaciones ────────────────────────────────

  /**
   * Busca una conversación activa del cliente o crea una nueva.
   * Se llama cada vez que llega un mensaje entrante.
   */
  async findOrCreate(
    customerId: string,
    channelType: ChannelType,
    channelThreadId: string | undefined,
    schemaName: string,
  ) {
    // Buscar conversación activa existente
    const existing = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, status, context
      FROM "${schemaName}".conversations
      WHERE customer_id = $1::uuid
        AND channel_type = $2
        AND status = 'active'
      ORDER BY last_message_at DESC NULLS LAST
      LIMIT 1
    `, customerId, channelType);

    if (existing[0]) return existing[0];

    // Crear nueva conversación
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".conversations
        (customer_id, channel_type, channel_thread_id, status, context)
      VALUES ($1::uuid, $2, $3, 'active', '{}'::jsonb)
      RETURNING id, status, context, created_at AS "createdAt"
    `, customerId, channelType, channelThreadId ?? null);

    return rows[0];
  }

  async saveMessage(
    conversationId: string,
    direction: 'inbound' | 'outbound',
    type: string,
    content: string | null,
    mediaUrl: string | null,
    externalId: string | null,
    schemaName: string,
  ) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".messages
        (conversation_id, direction, type, content, media_url, external_id)
      VALUES ($1::uuid, $2, $3, $4, $5, $6)
      RETURNING id, direction, type, content, created_at AS "createdAt"
    `, conversationId, direction, type, content, mediaUrl, externalId);

    // Actualizar last_message_at en la conversación
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET last_message_at = NOW()
      WHERE id = $1::uuid
    `, conversationId);

    return rows[0];
  }

  async updateContext(
    conversationId: string,
    context: Record<string, any>,
    schemaName: string,
  ) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET context = $1::jsonb
      WHERE id = $2::uuid
    `, JSON.stringify(context), conversationId);
  }

  async resolve(conversationId: string, schemaName: string) {
    await this.findById(conversationId, schemaName);
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET status = 'resolved'
      WHERE id = $1::uuid
    `, conversationId);
    return { success: true };
  }
}
