import {
  Controller, Get, Post, Param, Body,
  Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { MessagingFactory } from '../messaging/messaging-factory.service';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagingFactory: MessagingFactory,
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
}
