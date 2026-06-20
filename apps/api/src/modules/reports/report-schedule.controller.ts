import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

interface ReportScheduleDto {
  enabled?: boolean;
  frequency?: 'daily' | 'weekly' | 'monthly';
  time?: string;
  phone?: string;
}

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings/report-schedule')
export class ReportScheduleController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('admin', 'manager')
  async getSchedule(@TenantSchema() schema: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT agent_config->'reportSchedule' AS schedule
      FROM "${schema}".ai_config LIMIT 1
    `);

    return rows[0]?.schedule ?? {
      enabled: false,
      frequency: 'daily',
      time: '20:00',
      phone: '',
    };
  }

  @Patch()
  @Roles('admin')
  async updateSchedule(@Body() dto: ReportScheduleDto, @TenantSchema() schema: string) {
    // Ensure agent_config column exists
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schema}".ai_config
      ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}'
    `);

    // Get current schedule
    const current = await this.getSchedule(schema);
    const updated = { ...current, ...dto };

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".ai_config
      SET agent_config = jsonb_set(
        COALESCE(agent_config, '{}'::jsonb),
        '{reportSchedule}',
        $1::jsonb
      ), updated_at = NOW()
      WHERE id = (SELECT id FROM "${schema}".ai_config LIMIT 1)
    `, JSON.stringify(updated));

    return updated;
  }
}
