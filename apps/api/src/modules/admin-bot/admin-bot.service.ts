import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ReportsSummaryService } from '../reports/reports-summary.service';
import { ReportsFinancialService } from '../reports/reports-financial.service';

/**
 * Admin Bot Service — WhatsApp-based admin interface.
 * Allows business owners to query reports, check shipment status,
 * and receive alerts via WhatsApp without opening the dashboard.
 *
 * Features:
 * - whatsapp-alerts: Push notifications for important events
 * - sales-summary-query: "¿Cómo van las ventas hoy?"
 * - shipment-status-check: "¿Estado del pedido ORD-2026-00042?"
 */
@Injectable()
export class AdminBotService {
  private readonly logger = new Logger(AdminBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly summaryService: ReportsSummaryService,
    private readonly financialService: ReportsFinancialService,
  ) {}

  /**
   * Process an admin command received via WhatsApp.
   * Returns a formatted text response.
   */
  async processAdminCommand(
    message: string,
    schemaName: string,
  ): Promise<string> {
    const lower = message.toLowerCase().trim();

    // Sales summary
    if (/ventas|resumen|cómo (van|vamos)|ingresos/i.test(lower)) {
      return this.getSalesSummary(schemaName);
    }

    // Shipment status
    if (/pedido|envío|estado|ord-/i.test(lower)) {
      const orderMatch = message.match(/ORD-\d{4}-\d{5}/i);
      if (orderMatch) {
        return this.getOrderStatus(orderMatch[0], schemaName);
      }
      return this.getPendingShipments(schemaName);
    }

    // Low stock alert
    if (/stock|inventario|faltante/i.test(lower)) {
      return this.getLowStockAlert(schemaName);
    }

    // Pending payments
    if (/pagos?|pendientes?|cobrar/i.test(lower)) {
      return this.getPendingPayments(schemaName);
    }

    // Help
    return this.getHelpMessage();
  }

  // ─── Command Handlers ─────────────────────────────────────────

  private async getSalesSummary(schema: string): Promise<string> {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const summary = await this.summaryService.getBusinessSummary(schema, today, tomorrow);

    return `📊 *Resumen del día*\n\n` +
      `🛒 Pedidos: ${summary.orders.total}\n` +
      `💰 Ingresos: $${summary.revenue.total.toLocaleString()}\n` +
      `✅ Pagados: $${summary.revenue.paid.toLocaleString()}\n` +
      `⏳ Pendientes: $${summary.revenue.pending.toLocaleString()}\n` +
      `👥 Clientes nuevos: ${summary.customers.newInPeriod}\n` +
      `💬 Conversaciones activas: ${summary.conversations.active}`;
  }

  private async getOrderStatus(orderNumber: string, schema: string): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.order_number, o.status, o.total, o.updated_at,
             c.name AS customer_name,
             s.carrier, s.tracking_number, s.status AS shipment_status
      FROM "${schema}".orders o
      JOIN "${schema}".customers c ON c.id = o.customer_id
      LEFT JOIN "${schema}".shipments s ON s.order_id = o.id
      WHERE o.order_number = $1
    `, orderNumber.toUpperCase());

    if (!rows[0]) return `❌ Pedido ${orderNumber} no encontrado`;

    const o = rows[0];
    let msg = `📋 *${o.order_number}*\n` +
      `👤 ${o.customer_name}\n` +
      `💰 $${parseFloat(o.total).toLocaleString()}\n` +
      `📌 Estado: ${this.translateStatus(o.status)}\n`;

    if (o.tracking_number) {
      msg += `🚚 Envío: ${o.carrier} — ${o.tracking_number}\n`;
      msg += `📦 Estado envío: ${o.shipment_status}`;
    }

    return msg;
  }

  private async getPendingShipments(schema: string): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.order_number, c.name, o.status
      FROM "${schema}".orders o
      JOIN "${schema}".customers c ON c.id = o.customer_id
      WHERE o.status IN ('ready', 'paid', 'in_production')
      ORDER BY o.created_at ASC LIMIT 10
    `);

    if (rows.length === 0) return '✅ No hay pedidos pendientes de envío';

    let msg = `📦 *Pedidos pendientes (${rows.length})*\n\n`;
    for (const r of rows) {
      msg += `• ${r.order_number} — ${r.name} (${this.translateStatus(r.status)})\n`;
    }
    return msg;
  }

  private async getLowStockAlert(schema: string): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.name, p.sku, i.stock_available, i.stock_minimum
      FROM "${schema}".products p
      JOIN "${schema}".inventory i ON i.product_id = p.id
      WHERE i.stock_available < i.stock_minimum AND p.is_active = true
      ORDER BY i.stock_available ASC LIMIT 10
    `);

    if (rows.length === 0) return '✅ Todo el inventario está en niveles normales';

    let msg = `⚠️ *Productos bajo stock mínimo (${rows.length})*\n\n`;
    for (const r of rows) {
      msg += `• ${r.name} (${r.sku}): ${r.stock_available}/${r.stock_minimum}\n`;
    }
    return msg;
  }

  private async getPendingPayments(schema: string): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.order_number, o.total, c.name
      FROM "${schema}".orders o
      JOIN "${schema}".customers c ON c.id = o.customer_id
      WHERE o.status = 'payment_pending'
      ORDER BY o.created_at ASC LIMIT 10
    `);

    if (rows.length === 0) return '✅ No hay pagos pendientes';

    const total = rows.reduce((sum, r) => sum + parseFloat(r.total), 0);
    let msg = `💳 *Pagos pendientes (${rows.length}) — Total: $${total.toLocaleString()}*\n\n`;
    for (const r of rows) {
      msg += `• ${r.order_number} — ${r.name} — $${parseFloat(r.total).toLocaleString()}\n`;
    }
    return msg;
  }

  private getHelpMessage(): string {
    return `🤖 *Admin Bot — Comandos disponibles*\n\n` +
      `📊 "ventas" — Resumen del día\n` +
      `📋 "ORD-2026-00001" — Estado de un pedido\n` +
      `📦 "envíos" — Pedidos pendientes de envío\n` +
      `📉 "stock" — Productos bajo mínimo\n` +
      `💳 "pagos" — Pagos pendientes por cobrar`;
  }

  // ─── Alerts (push to admin WhatsApp) ──────────────────────────

  /**
   * Generate alert messages for important events.
   * Called by event processors to notify the admin.
   */
  formatAlert(type: AlertType, data: Record<string, any>): string {
    switch (type) {
      case 'new_order':
        return `🛒 *Nuevo pedido* ${data.orderNumber}\n${data.customerName} — $${data.total}`;
      case 'payment_received':
        return `💰 *Pago recibido* ${data.orderNumber}\n$${data.amount} via ${data.method}`;
      case 'low_stock':
        return `⚠️ *Stock bajo* ${data.productName}\nActual: ${data.current}/${data.minimum}`;
      case 'shipment_delivered':
        return `✅ *Entregado* ${data.orderNumber}\n${data.customerName}`;
      default:
        return `📢 ${JSON.stringify(data)}`;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private translateStatus(status: string): string {
    const map: Record<string, string> = {
      new: '🆕 Nuevo',
      payment_pending: '⏳ Esperando pago',
      paid: '✅ Pagado',
      in_production: '🏭 En producción',
      ready: '📦 Listo para envío',
      shipped: '🚚 Enviado',
      delivered: '✅ Entregado',
      cancelled: '❌ Cancelado',
    };
    return map[status] ?? status;
  }
}

type AlertType = 'new_order' | 'payment_received' | 'low_stock' | 'shipment_delivered';
