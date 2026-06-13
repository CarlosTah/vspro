import {
  Controller, Get, Post, Param,
  Query, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

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
}
