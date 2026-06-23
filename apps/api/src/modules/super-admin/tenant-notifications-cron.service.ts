import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { MessagingFactory } from '../messaging/messaging-factory.service';

/**
 * Automatic tenant notifications:
 * 1. Trial expiry warning — 2 days before trial ends
 * 2. Upcoming charge reminder — 3 days before monthly charge
 * 3. Trial expired — day of expiry
 */
@Injectable()
export class TenantNotificationsCronService {
  private readonly logger = new Logger(TenantNotificationsCronService.name);
  private readonly VSPRO_SCHEMA = 'tenant_vspro';

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingFactory,
  ) {}

  /**
   * Runs daily at 10:00 AM — check trial expiry warnings
   */
  @Cron('0 10 * * *')
  async checkTrialExpiry(): Promise<void> {
    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    // Tenants whose trial expires in ~2 days
    const expiringTrials = await this.prisma.tenant.findMany({
      where: {
        status: 'TRIAL',
        trialEndsAt: {
          gte: oneDayFromNow,
          lte: twoDaysFromNow,
        },
      },
      select: { id: true, slug: true, schemaName: true, businessName: true, ownerEmail: true, trialEndsAt: true },
    });

    for (const tenant of expiringTrials) {
      const daysLeft = Math.ceil((tenant.trialEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const message = `⏰ Hola! Tu prueba gratuita de VSPRO para *${tenant.businessName}* vence en ${daysLeft} día${daysLeft > 1 ? 's' : ''}.\n\n` +
        `Para no perder tu configuración y seguir recibiendo pedidos por WhatsApp, elige un plan:\n` +
        `👉 https://app.vspro.app/settings/billing\n\n` +
        `¿Tienes dudas? Responde aquí y te ayudamos.`;

      await this.sendToTenantOwner(tenant, message);
    }

    if (expiringTrials.length > 0) {
      this.logger.log(`Trial expiry warnings sent to ${expiringTrials.length} tenants`);
    }

    // Tenants whose trial expired today
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const expiredToday = await this.prisma.tenant.findMany({
      where: {
        status: 'TRIAL',
        trialEndsAt: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
      select: { id: true, slug: true, schemaName: true, businessName: true, ownerEmail: true },
    });

    for (const tenant of expiredToday) {
      const message = `🔔 Tu prueba gratuita de VSPRO para *${tenant.businessName}* ha terminado hoy.\n\n` +
        `Tu agente IA dejará de responder mensajes hasta que actives un plan.\n\n` +
        `Activa ahora → https://app.vspro.app/settings/billing\n\n` +
        `Planes desde $990/mes. ¿Necesitas más tiempo? Responde aquí.`;

      await this.sendToTenantOwner(tenant, message);
    }

    if (expiredToday.length > 0) {
      this.logger.log(`Trial expired notifications sent to ${expiredToday.length} tenants`);
    }
  }

  /**
   * Runs on the 28th of each month at 10:00 AM — upcoming charge reminder
   */
  @Cron('0 10 28 * *')
  async upcomingChargeReminder(): Promise<void> {
    const activeTenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      include: { plan: true },
    });

    for (const tenant of activeTenants) {
      const price = parseFloat(String(tenant.plan?.priceMonthly ?? '0'));
      if (price <= 0) continue;

      const message = `📋 Recordatorio VSPRO: Tu cargo mensual de *$${price.toLocaleString('es-MX')} MXN* (plan ${tenant.plan?.name}) ` +
        `se procesará en los próximos días.\n\n` +
        `Asegúrate de tener fondos disponibles. Si necesitas cambiar de plan o método de pago:\n` +
        `👉 https://app.vspro.app/settings/billing\n\n` +
        `Gracias por confiar en VSPRO 🙌`;

      await this.sendToTenantOwner(tenant, message);
    }

    if (activeTenants.length > 0) {
      this.logger.log(`Upcoming charge reminders sent to ${activeTenants.length} active tenants`);
    }
  }

  // ─── Helper ───────────────────────────────────────────────────

  private async sendToTenantOwner(tenant: { schemaName: string; ownerEmail: string; businessName: string }, message: string): Promise<void> {
    try {
      // Try to find owner's phone in their schema
      const phones = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT phone FROM "${tenant.schemaName}".users
        WHERE role = 'admin' AND phone IS NOT NULL
        LIMIT 1
      `).catch(() => []);

      if (phones?.[0]?.phone) {
        await this.messaging.sendText(phones[0].phone, message, 'whatsapp', this.VSPRO_SCHEMA);
        return;
      }

      // Fallback: look for tenant owner as a customer in VSPRO's own schema
      const customers = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT channel_id FROM "${this.VSPRO_SCHEMA}".customers
        WHERE email = $1 OR name ILIKE $2
        LIMIT 1
      `, tenant.ownerEmail, `%${tenant.businessName}%`).catch(() => []);

      if (customers?.[0]?.channel_id) {
        await this.messaging.sendText(customers[0].channel_id, message, 'whatsapp', this.VSPRO_SCHEMA);
      }
    } catch (err: any) {
      this.logger.debug(`Could not notify ${tenant.ownerEmail}: ${err.message}`);
    }
  }
}
