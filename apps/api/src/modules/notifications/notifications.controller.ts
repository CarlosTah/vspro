import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Get notification preferences for the tenant */
  @Get('preferences')
  @Roles('admin')
  async getPreferences(@TenantSchema() schema: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT agent_config->'notifications' AS prefs FROM "${schema}".ai_config LIMIT 1`,
    );

    return rows[0]?.prefs ?? {
      new_order: true,
      payment_verified: true,
      low_stock: true,
      shipment_delivered: true,
      escalation: true,
      daily_summary: true,
    };
  }

  /** Update notification preferences */
  @Patch('preferences')
  @Roles('admin')
  async updatePreferences(
    @Body() prefs: Record<string, boolean>,
    @TenantSchema() schema: string,
  ) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".ai_config
      SET agent_config = jsonb_set(
        COALESCE(agent_config, '{}'::jsonb),
        '{notifications}',
        $1::jsonb
      )
      WHERE id = (SELECT id FROM "${schema}".ai_config LIMIT 1)
    `, JSON.stringify(prefs));

    return { success: true, preferences: prefs };
  }

  /** Set owner's WhatsApp phone for notifications */
  @Patch('owner-phone')
  @Roles('admin')
  async setOwnerPhone(
    @Body() body: { phone: string },
    @TenantSchema() schema: string,
  ) {
    // Store in tenant settings
    const tenant = await this.prisma.tenant.findFirst({ where: { schemaName: schema } });
    if (tenant) {
      const currentSettings = (tenant.settings as Record<string, any>) ?? {};
      await this.prisma.tenant.update({
        where: { id: tenant.id },
        data: { settings: { ...currentSettings, ownerPhone: body.phone } },
      });
    }

    return { success: true, phone: body.phone };
  }
}
