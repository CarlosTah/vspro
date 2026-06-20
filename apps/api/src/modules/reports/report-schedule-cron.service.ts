import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { MessagingFactory } from '../messaging/messaging-factory.service';

interface ReportSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string; // "20:00"
  phone: string; // WhatsApp number to send to
}

/**
 * Cron that runs every hour and sends scheduled WhatsApp reports
 * to tenants based on their configured frequency and time.
 */
@Injectable()
export class ReportScheduleCronService {
  private readonly logger = new Logger(ReportScheduleCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingFactory: MessagingFactory,
  ) {}

  /**
   * Runs every hour at minute 0. Checks which tenants have a report
   * scheduled for this hour and sends it.
   */
  @Cron('0 * * * *')
  async checkAndSendReports(): Promise<void> {
    const now = new Date();
    const currentHour = now.toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
    const hourStr = currentHour.split(':')[0] + ':00';
    const dayOfWeek = now.toLocaleString('en-US', { timeZone: 'America/Mexico_City', weekday: 'short' }).toLowerCase();
    const dayOfMonth = parseInt(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City', day: 'numeric' }));

    this.logger.debug(`Report cron check: ${hourStr}, ${dayOfWeek}, day ${dayOfMonth}`);

    // Get all active tenants
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { id: true, slug: true, schemaName: true, businessName: true, ownerEmail: true },
    });

    for (const tenant of tenants) {
      try {
        const schedule = await this.getReportSchedule(tenant.schemaName);
        if (!schedule || !schedule.enabled || !schedule.phone) continue;

        // Check if time matches
        const configuredHour = schedule.time?.split(':')[0] + ':00';
        if (configuredHour !== hourStr) continue;

        // Check frequency
        if (schedule.frequency === 'weekly' && dayOfWeek !== 'mon') continue;
        if (schedule.frequency === 'monthly' && dayOfMonth !== 1) continue;

        // Generate and send report
        this.logger.log(`Sending ${schedule.frequency} report to ${tenant.slug} (${schedule.phone})`);
        const reportText = await this.generateReport(tenant.schemaName, tenant.businessName, schedule.frequency);
        await this.sendWhatsAppReport(tenant.schemaName, schedule.phone, reportText);

      } catch (err: any) {
        this.logger.error(`Error sending report to ${tenant.slug}: ${err.message}`);
      }
    }
  }

  private async getReportSchedule(schemaName: string): Promise<ReportSchedule | null> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT agent_config->'reportSchedule' AS schedule
        FROM "${schemaName}".ai_config LIMIT 1
      `);
      return rows[0]?.schedule ?? null;
    } catch {
      return null;
    }
  }

  private async generateReport(schemaName: string, businessName: string, frequency: string): Promise<string> {
    let dateFilter: string;
    let periodLabel: string;

    if (frequency === 'daily') {
      dateFilter = `created_at >= CURRENT_DATE`;
      periodLabel = 'del día';
    } else if (frequency === 'weekly') {
      dateFilter = `created_at >= CURRENT_DATE - INTERVAL '7 days'`;
      periodLabel = 'de la semana';
    } else {
      dateFilter = `created_at >= DATE_TRUNC('month', CURRENT_DATE)`;
      periodLabel = 'del mes';
    }

    // Orders stats
    const orders = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
        COUNT(*) FILTER (WHERE status IN ('new','payment_pending','in_production','ready','shipped')) AS pending,
        COALESCE(SUM(total), 0) AS revenue,
        COALESCE(SUM(total) FILTER (WHERE status = 'delivered'), 0) AS collected
      FROM "${schemaName}".orders
      WHERE ${dateFilter}
    `);

    // New customers
    const customers = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COUNT(*) AS total FROM "${schemaName}".customers WHERE ${dateFilter}
    `);

    // Top product
    const topProducts = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        items->>'productName' AS name,
        SUM((items->>'quantity')::int) AS qty
      FROM "${schemaName}".orders,
        jsonb_array_elements(items) AS items
      WHERE ${dateFilter} AND status != 'cancelled'
      GROUP BY items->>'productName'
      ORDER BY qty DESC LIMIT 3
    `);

    // Low stock
    const lowStock = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.name, i.stock_available
      FROM "${schemaName}".inventory i
      JOIN "${schemaName}".products p ON p.id = i.product_id
      WHERE i.stock_available <= i.stock_minimum AND p.is_active = true
      LIMIT 3
    `);

    const r = orders[0] ?? {};
    const totalOrders = parseInt(r.total) || 0;
    const delivered = parseInt(r.delivered) || 0;
    const pending = parseInt(r.pending) || 0;
    const revenue = parseFloat(r.revenue) || 0;
    const collected = parseFloat(r.collected) || 0;
    const newCust = parseInt(customers[0]?.total) || 0;

    const now = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' });

    let report = `📊 *Resumen ${periodLabel}* — ${businessName}\n📅 ${now}\n\n`;
    report += `💰 Ventas: $${revenue.toLocaleString('es-MX')} MXN (${totalOrders} pedidos)\n`;
    report += `✅ Entregados: ${delivered}\n`;
    if (pending > 0) report += `📋 Pendientes: ${pending}\n`;
    if (collected > 0 && collected !== revenue) report += `💳 Cobrado: $${collected.toLocaleString('es-MX')}\n`;
    report += `👥 Nuevos clientes: ${newCust}\n`;

    if (topProducts.length > 0) {
      report += `\n🏆 *Top productos:*\n`;
      topProducts.forEach((p: any, i: number) => {
        report += `  ${i + 1}. ${p.name} (${p.qty} uds)\n`;
      });
    }

    if (lowStock.length > 0) {
      report += `\n⚠️ *Stock bajo:*\n`;
      lowStock.forEach((p: any) => {
        report += `  • ${p.name} (${p.stock_available} restantes)\n`;
      });
    }

    report += `\n¡Buen trabajo! 🚀`;
    return report;
  }

  private async sendWhatsAppReport(schemaName: string, phone: string, text: string): Promise<void> {
    const result = await this.messagingFactory.sendText(phone, text, 'whatsapp', schemaName);
    if (!result.success) {
      this.logger.warn(`Failed to send report to ${phone}: ${result.error}`);
    }
  }
}
