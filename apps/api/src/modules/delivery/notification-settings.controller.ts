import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings/notifications')
export class NotificationSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('admin', 'manager')
  async getSettings(@TenantSchema() schema: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT agent_config->'notificationMessages' AS messages
      FROM "${schema}".ai_config LIMIT 1
    `).catch(() => []);
    return { messages: rows[0]?.messages ?? {} };
  }

  @Patch()
  @Roles('admin')
  async updateSettings(@Body() dto: { messages: Record<string, string> }, @TenantSchema() schema: string) {
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schema}".ai_config ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}'
    `);
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".ai_config
      SET agent_config = jsonb_set(
        COALESCE(agent_config, '{}'::jsonb),
        '{notificationMessages}',
        $1::jsonb
      ), updated_at = NOW()
      WHERE id = (SELECT id FROM "${schema}".ai_config LIMIT 1)
    `, JSON.stringify(dto.messages));
    return { messages: dto.messages };
  }
}
