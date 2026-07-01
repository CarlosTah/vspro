import {
  Controller, Get, Post, Patch, Param, Body,
  Query, UseGuards, ParseUUIDPipe,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { MessagingFactory } from '../messaging/messaging-factory.service';
import { MessagingService } from '../messaging/messaging.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagingFactory: MessagingFactory,
    private readonly messagingService: MessagingService,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'resolved', 'waiting'] })
  findAll(
    @TenantSchema() schema: string,
    @Query('status') status?: string,
  ) {
    return this.conversationsService.findAll(schema, status);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.conversationsService.findById(id, schema);
  }

  @Get(':id/messages')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
    @Query('limit') limit?: number,
  ) {
    return this.conversationsService.getMessages(id, schema, limit ?? 50);
  }

  @Post(':id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.conversationsService.resolve(id, schema);
  }

  /** Send a manual reply from the dashboard (bypasses AI) */
  @Post(':id/reply')
  async reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { text: string },
    @TenantSchema() schema: string,
  ) {
    // Get conversation details (customer + channel)
    const convRows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT c.channel_type, c.customer_id, cu.channel_id AS recipient_id, cu.name AS customer_name
      FROM "${schema}".conversations c
      JOIN "${schema}".customers cu ON cu.id = c.customer_id
      WHERE c.id = $1::uuid
    `, id);

    if (!convRows[0]) throw new Error('Conversación no encontrada');

    const { channel_type, recipient_id } = convRows[0];

    // Send message via WhatsApp/Messenger
    const result = await this.messagingFactory.sendText(recipient_id, body.text, channel_type, schema);

    // Save outbound message in conversation
    await this.conversationsService.saveMessage(id, 'outbound', 'text', body.text, null, null, schema);

    // Update last_message_at
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".conversations SET last_message_at = NOW() WHERE id = $1::uuid
    `, id);

    return { success: result.success, message: result.success ? 'Mensaje enviado' : `Error: ${result.error}` };
  }

  /** Send media (image, document, audio) from dashboard */
  @Post(':id/send-media')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async sendMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
    @Body() body: { caption?: string },
    @TenantSchema() schema: string,
  ) {
    if (!file) throw new Error('No se proporcionó archivo');

    // Get conversation details
    const convRows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT c.channel_type, cu.channel_id AS recipient_id
      FROM "${schema}".conversations c
      JOIN "${schema}".customers cu ON cu.id = c.customer_id
      WHERE c.id = $1::uuid
    `, id);

    if (!convRows[0]) throw new Error('Conversación no encontrada');
    const { channel_type, recipient_id } = convRows[0];

    // Send via Meta
    const result = await this.messagingService.sendMedia(
      channel_type,
      recipient_id,
      file.buffer,
      file.mimetype,
      file.originalname,
      schema,
      body.caption,
    );

    // Determine message type for storage
    const msgType = file.mimetype.startsWith('image/') ? 'image'
      : file.mimetype.startsWith('audio/') ? 'audio'
      : 'document';

    // Save outbound message
    const content = body.caption
      ? `[${msgType === 'image' ? '📷' : msgType === 'audio' ? '🎤' : '📄'} ${file.originalname}] ${body.caption}`
      : `[${msgType === 'image' ? '📷 Imagen' : msgType === 'audio' ? '🎤 Audio' : '📄 ' + file.originalname}]`;

    await this.conversationsService.saveMessage(id, 'outbound', msgType, content, null, null, schema);

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".conversations SET last_message_at = NOW() WHERE id = $1::uuid
    `, id);

    return { success: result.success, type: msgType, filename: file.originalname, error: result.error };
  }

  // ─── Message Rating & Correction (Layer 3: AI Maturation) ─────

  /** Rate a message (thumbs up/down) */
  @Patch('messages/:messageId/rate')
  async rateMessage(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() body: { rating: 'up' | 'down' },
    @TenantSchema() schema: string,
  ) {
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schema}".messages ADD COLUMN IF NOT EXISTS rating VARCHAR(10)
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schema}".messages ADD COLUMN IF NOT EXISTS correction TEXT
    `);
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".messages SET rating = $1 WHERE id = $2::uuid
    `, body.rating, messageId);
    return { success: true };
  }

  /** Correct a message — saves correction AND auto-creates KB entry */
  @Post('messages/:messageId/correct')
  async correctMessage(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() body: { correction: string },
    @TenantSchema() schema: string,
  ) {
    // Ensure columns exist
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schema}".messages ADD COLUMN IF NOT EXISTS rating VARCHAR(10)
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schema}".messages ADD COLUMN IF NOT EXISTS correction TEXT
    `);

    // Get the original message content
    const msgs = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT content FROM "${schema}".messages WHERE id = $1::uuid
    `, messageId);
    const originalContent = msgs[0]?.content ?? '';

    // Save correction and mark as thumbs down
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".messages SET rating = 'down', correction = $1 WHERE id = $2::uuid
    `, body.correction, messageId);

    // Auto-create Knowledge Base entry with the correction
    await this.knowledgeBase.create({
      title: `Corrección: ${originalContent.slice(0, 80)}...`,
      content: `Cuando el agente responda sobre este tema, la respuesta correcta es:\n\n${body.correction}\n\n(Respuesta original incorrecta: "${originalContent.slice(0, 200)}")`,
      category: 'correction',
    }, schema);

    return { success: true, message: 'Corrección guardada y base de conocimiento actualizada' };
  }

  /** Get AI quality metrics */
  @Get('quality/metrics')
  async getQualityMetrics(@TenantSchema() schema: string) {
    // Ensure columns exist
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schema}".messages ADD COLUMN IF NOT EXISTS rating VARCHAR(10)
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schema}".messages ADD COLUMN IF NOT EXISTS correction TEXT
    `);

    const metrics = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) FILTER (WHERE direction = 'outbound' AND ai_processed = true)::int AS "totalAiMessages",
        COUNT(*) FILTER (WHERE rating = 'up')::int AS "thumbsUp",
        COUNT(*) FILTER (WHERE rating = 'down')::int AS "thumbsDown",
        COUNT(*) FILTER (WHERE correction IS NOT NULL)::int AS "corrections"
      FROM "${schema}".messages
    `);

    const m = metrics[0] ?? {};
    const total = (m.thumbsUp ?? 0) + (m.thumbsDown ?? 0);
    const satisfactionRate = total > 0 ? Math.round((m.thumbsUp / total) * 100) : 100;

    // Get recent corrections
    const recentCorrections = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT m.id, m.content AS "originalMessage", m.correction, m.created_at AS "createdAt",
             c.customer_id
      FROM "${schema}".messages m
      JOIN "${schema}".conversations conv ON conv.id = m.conversation_id
      LEFT JOIN "${schema}".customers c ON c.id = conv.customer_id
      WHERE m.correction IS NOT NULL
      ORDER BY m.created_at DESC
      LIMIT 20
    `);

    // Get recent thumbs down without correction (need attention)
    const needsAttention = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT m.id, m.content AS "message", m.created_at AS "createdAt"
      FROM "${schema}".messages m
      WHERE m.rating = 'down' AND m.correction IS NULL
      ORDER BY m.created_at DESC
      LIMIT 10
    `);

    return {
      totalAiMessages: m.totalAiMessages ?? 0,
      thumbsUp: m.thumbsUp ?? 0,
      thumbsDown: m.thumbsDown ?? 0,
      corrections: m.corrections ?? 0,
      satisfactionRate,
      recentCorrections,
      needsAttention,
    };
  }
}
