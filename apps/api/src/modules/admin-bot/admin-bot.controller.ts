import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminBotService } from './admin-bot.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('admin-bot')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('admin-bot')
export class AdminBotController {
  constructor(private readonly adminBot: AdminBotService) {}

  /** Process an admin command (simulates WhatsApp admin query) */
  @Post('query')
  @Roles('admin')
  async query(@Body() body: { message: string }, @TenantSchema() schema: string) {
    const response = await this.adminBot.processAdminCommand(body.message, schema);
    return { response };
  }
}
