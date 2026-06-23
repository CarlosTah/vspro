import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

export interface DeliverySettingsDto {
  autoDispatchEnabled?: boolean;
  timeoutMinutes?: number;
  maxRetries?: number;
  autoPrintOnPayment?: boolean;
  notifyClientOnShipped?: boolean;
  notifyClientOnDelivered?: boolean;
  dispatchMessage?: string;
}

export interface DeliverySettings {
  autoDispatchEnabled: boolean;
  timeoutMinutes: number;
  maxRetries: number;
  autoPrintOnPayment: boolean;
  notifyClientOnShipped: boolean;
  notifyClientOnDelivered: boolean;
  dispatchMessage: string;
}

const DEFAULT_SETTINGS: DeliverySettings = {
  autoDispatchEnabled: true,
  timeoutMinutes: 5,
  maxRetries: 3,
  autoPrintOnPayment: false,
  notifyClientOnShipped: true,
  notifyClientOnDelivered: true,
  dispatchMessage: '📦 Pedido #{orderNumber} listo para entrega.\n📍 Dirección: {address}\n💰 Total: ${total}\n\n¿Puedes recogerlo? Responde SI o NO',
};

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings/delivery')
export class DeliverySettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('admin', 'manager', 'delivery')
  async getSettings(@TenantSchema() schema: string): Promise<DeliverySettings> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT agent_config->'deliverySettings' AS settings
      FROM "${schema}".ai_config LIMIT 1
    `);
    return { ...DEFAULT_SETTINGS, ...(rows[0]?.settings ?? {}) };
  }

  @Patch()
  @Roles('admin')
  async updateSettings(@Body() dto: DeliverySettingsDto, @TenantSchema() schema: string): Promise<DeliverySettings> {
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schema}".ai_config
      ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}'
    `);

    const current = await this.getSettings(schema);
    const updated = { ...current, ...dto };

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".ai_config
      SET agent_config = jsonb_set(
        COALESCE(agent_config, '{}'::jsonb),
        '{deliverySettings}',
        $1::jsonb
      ), updated_at = NOW()
      WHERE id = (SELECT id FROM "${schema}".ai_config LIMIT 1)
    `, JSON.stringify(updated));

    return updated;
  }
}
