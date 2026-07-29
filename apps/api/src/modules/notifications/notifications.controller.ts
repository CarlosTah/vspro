import { Controller, Get, Post, Patch, Body, UseGuards } from '@nestjs/common';
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

  /** Badge count: pending orders + open escalations */
  @Get('badge')
  async getBadge(@TenantSchema() schema: string) {
    let pendingOrders = 0;
    let openEscalations = 0;

    try {
      const orders = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS count FROM "${schema}".orders WHERE status IN ('new', 'payment_pending', 'in_production', 'ready')`,
      );
      pendingOrders = orders[0]?.count ?? 0;
    } catch {}

    try {
      const escalations = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS count FROM "${schema}".escalations WHERE status = 'open'`,
      );
      openEscalations = escalations[0]?.count ?? 0;
    } catch {}

    return { count: pendingOrders + openEscalations, pendingOrders, openEscalations };
  }

  /** Recent notification events for the dropdown */
  @Get('recent')
  async getRecent(@TenantSchema() schema: string) {
    const events: any[] = [];

    try {
      const orders = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT order_number AS "orderNumber", status, total, created_at AS "createdAt"
        FROM "${schema}".orders
        ORDER BY created_at DESC LIMIT 5
      `);
      orders.forEach((o) =>
        events.push({
          type: 'order',
          icon:
            o.status === 'delivered'
              ? '✅'
              : o.status === 'ready'
                ? '🎉'
                : o.status === 'in_production'
                  ? '👨‍🍳'
                  : '🛒',
          title: `Pedido ${o.orderNumber}`,
          subtitle:
            o.status === 'new'
              ? 'Nuevo'
              : o.status === 'in_production'
                ? 'En cocina'
                : o.status === 'ready'
                  ? 'Listo'
                  : o.status === 'delivered'
                    ? 'Entregado'
                    : o.status,
          total: o.total,
          createdAt: o.createdAt,
        }),
      );
    } catch {}

    try {
      const escalations = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT reason, priority, status, order_number AS "orderNumber", created_at AS "createdAt"
        FROM "${schema}".escalations
        ORDER BY created_at DESC LIMIT 3
      `);
      escalations.forEach((e) =>
        events.push({
          type: 'complaint',
          icon: '⚠️',
          title: `Queja: ${e.reason?.substring(0, 40)}`,
          subtitle: e.orderNumber ?? 'Sin pedido',
          createdAt: e.createdAt,
        }),
      );
    } catch {}

    events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return events.slice(0, 8);
  }

  /** Store a push subscription for this tenant */
  @Post('push/subscribe')
  async subscribePush(@Body() body: { subscription: any }, @TenantSchema() schema: string) {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schema}".push_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subscription JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO "${schema}".push_subscriptions (subscription) VALUES ($1::jsonb)
    `,
      JSON.stringify(body.subscription),
    );
    return { success: true };
  }

  /** Get notification preferences for the tenant */
  @Get('preferences')
  @Roles('admin')
  async getPreferences(@TenantSchema() schema: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT agent_config->'notifications' AS prefs FROM "${schema}".ai_config LIMIT 1`,
    );

    return (
      rows[0]?.prefs ?? {
        new_order: true,
        payment_verified: true,
        low_stock: true,
        shipment_delivered: true,
        escalation: true,
        daily_summary: true,
      }
    );
  }

  /** Update notification preferences */
  @Patch('preferences')
  @Roles('admin')
  async updatePreferences(@Body() prefs: Record<string, boolean>, @TenantSchema() schema: string) {
    await this.prisma.$executeRawUnsafe(
      `
      UPDATE "${schema}".ai_config
      SET agent_config = jsonb_set(
        COALESCE(agent_config, '{}'::jsonb),
        '{notifications}',
        $1::jsonb
      )
      WHERE id = (SELECT id FROM "${schema}".ai_config LIMIT 1)
    `,
      JSON.stringify(prefs),
    );

    return { success: true, preferences: prefs };
  }

  /** Set owner's WhatsApp phone for notifications */
  @Patch('owner-phone')
  @Roles('admin')
  async setOwnerPhone(@Body() body: { phone: string }, @TenantSchema() schema: string) {
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
