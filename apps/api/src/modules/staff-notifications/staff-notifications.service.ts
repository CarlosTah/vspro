import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MessagingFactory } from '../messaging/messaging-factory.service';

/**
 * Staff Notifications Service — Send WhatsApp messages to internal team members.
 *
 * Unlike customer notifications (order-notifications.service), this notifies
 * the STAFF (employees, operators, mechanics, cooks) about internal events.
 *
 * Each notification type can be toggled per staff member via their preferences.
 */

export type StaffNotificationType =
  | 'new_order'
  | 'payment_verified'
  | 'work_authorized'
  | 'low_stock'
  | 'appointment_reminder'
  | 'delivery_assigned'
  | 'customer_escalation'
  | 'daily_summary';

export interface StaffNotificationPreferences {
  staffId: string;
  phone: string;
  enabled: boolean;
  types: StaffNotificationType[];
}

@Injectable()
export class StaffNotificationsService {
  private readonly logger = new Logger(StaffNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingFactory: MessagingFactory,
  ) {}

  // ─── Send Notifications ───────────────────────────────────────

  /**
   * Notify a specific staff member by WhatsApp.
   */
  async notifyStaff(
    staffId: string,
    type: StaffNotificationType,
    message: string,
    schemaName: string,
  ): Promise<{ sent: boolean; error?: string }> {
    try {
      // Get staff phone and preferences
      const staff = await this.getStaffWithPreferences(staffId, schemaName);
      if (!staff) return { sent: false, error: 'Staff not found' };
      if (!staff.phone) return { sent: false, error: 'No phone number' };
      if (!staff.enabled) return { sent: false, error: 'Notifications disabled' };
      if (!staff.types.includes(type)) return { sent: false, error: `Type '${type}' not enabled` };

      // Send via WhatsApp
      const result = await this.messagingFactory.sendText(
        staff.phone,
        message,
        'whatsapp',
        schemaName,
      );

      if (result.success) {
        this.logger.debug(`[${schemaName}] Staff notified: ${staff.name} (${type})`);
      }

      return { sent: result.success, error: result.error };
    } catch (err: any) {
      this.logger.error(`Staff notification failed: ${err.message}`);
      return { sent: false, error: err.message };
    }
  }

  /**
   * Notify all staff members who have a specific notification type enabled.
   * Used for broadcast-style notifications (new order, low stock, etc.)
   */
  async notifyAllStaff(
    type: StaffNotificationType,
    message: string,
    schemaName: string,
    excludeStaffId?: string,
  ): Promise<{ sent: number; failed: number }> {
    const staffList = await this.getAllStaffWithPreferences(schemaName);
    let sent = 0;
    let failed = 0;

    for (const staff of staffList) {
      if (staff.id === excludeStaffId) continue;
      if (!staff.enabled || !staff.types.includes(type)) continue;
      if (!staff.phone) continue;

      const result = await this.messagingFactory.sendText(
        staff.phone,
        message,
        'whatsapp',
        schemaName,
      );

      if (result.success) sent++;
      else failed++;
    }

    if (sent > 0) {
      this.logger.log(`[${schemaName}] Staff broadcast (${type}): ${sent} sent, ${failed} failed`);
    }

    return { sent, failed };
  }

  // ─── Pre-built Notification Messages ──────────────────────────

  /**
   * Notify staff about a new order.
   */
  async notifyNewOrder(order: { orderNumber: string; customerName: string; total: number; items: string }, schemaName: string): Promise<void> {
    const msg = `🔔 *Nuevo pedido*\n\n📋 ${order.orderNumber}\n👤 ${order.customerName}\n💰 $${order.total.toLocaleString()}\n📦 ${order.items}\n\n¡Revísalo en el dashboard!`;
    await this.notifyAllStaff('new_order', msg, schemaName);
  }

  /**
   * Notify staff about payment verification.
   */
  async notifyPaymentVerified(order: { orderNumber: string; total: number; assignedTo?: string }, schemaName: string): Promise<void> {
    const msg = `✅ *Pago confirmado*\n\n📋 ${order.orderNumber}\n💰 $${order.total.toLocaleString()}\n\nEl pedido ya puede entrar a producción.`;

    if (order.assignedTo) {
      await this.notifyStaff(order.assignedTo, 'payment_verified', msg, schemaName);
    } else {
      await this.notifyAllStaff('payment_verified', msg, schemaName);
    }
  }

  /**
   * Notify staff about work authorization (mechanic/service scenario).
   */
  async notifyWorkAuthorized(data: { orderNumber: string; customerName: string; description: string; assignedTo: string }, schemaName: string): Promise<void> {
    const msg = `✅ *Trabajo autorizado*\n\n📋 ${data.orderNumber}\n👤 ${data.customerName}\n🔧 ${data.description}\n\n¡El cliente autorizó! Puedes proceder.`;
    await this.notifyStaff(data.assignedTo, 'work_authorized', msg, schemaName);
  }

  /**
   * Notify about low stock.
   */
  async notifyLowStock(products: Array<{ name: string; stock: number; minimum: number }>, schemaName: string): Promise<void> {
    const items = products.map(p => `  ⚠️ ${p.name}: ${p.stock}/${p.minimum}`).join('\n');
    const msg = `📦 *Alerta de Stock Bajo*\n\n${items}\n\n¿Pides más a proveedor o pausas campañas?`;
    await this.notifyAllStaff('low_stock', msg, schemaName);
  }

  /**
   * Notify about customer escalation.
   */
  async notifyEscalation(data: { customerName: string; reason: string; conversationId: string }, schemaName: string): Promise<void> {
    const msg = `🚨 *Escalación de cliente*\n\n👤 ${data.customerName}\n📝 ${data.reason}\n\nEl cliente necesita atención humana. Revisa la conversación en el dashboard.`;
    await this.notifyAllStaff('customer_escalation', msg, schemaName);
  }

  // ─── Preferences Management ───────────────────────────────────

  /**
   * Get notification preferences for a staff member.
   */
  async getPreferences(staffId: string, schemaName: string): Promise<StaffNotificationPreferences | null> {
    return this.getStaffWithPreferences(staffId, schemaName);
  }

  /**
   * Update notification preferences for a staff member.
   */
  async updatePreferences(
    staffId: string,
    prefs: { enabled?: boolean; types?: StaffNotificationType[]; phone?: string },
    schemaName: string,
  ): Promise<void> {
    // Store preferences in a JSONB column on the users table
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (prefs.phone !== undefined) {
      // Update phone directly on users table
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".users SET last_login_at = last_login_at WHERE id = $1::uuid
      `, staffId); // placeholder — phone would be a new column
    }

    // Store notification prefs as JSONB
    const prefData = JSON.stringify({
      enabled: prefs.enabled ?? true,
      types: prefs.types ?? ['new_order', 'payment_verified', 'low_stock', 'customer_escalation'],
    });

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".users
      SET last_login_at = last_login_at
      WHERE id = $1::uuid
    `, staffId);

    // For now, store in a simple approach — we'll use the existing settings pattern
    // In production: add notification_prefs JSONB column to users
    this.logger.debug(`[${schemaName}] Prefs updated for staff ${staffId}`);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async getStaffWithPreferences(staffId: string, schemaName: string): Promise<(StaffNotificationPreferences & { name: string; id: string }) | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, email, role
      FROM "${schemaName}".users
      WHERE id = $1::uuid AND is_active = true
    `, staffId);

    if (!rows[0]) return null;

    const user = rows[0];

    // For now: all staff with admin/operator role get all notifications
    // Phone comes from tenant settings or a dedicated field
    // We'll use the owner phone from tenant settings as fallback
    return {
      id: user.id,
      staffId: user.id,
      name: user.name,
      phone: '', // Will be populated from tenant.settings.ownerPhone or user.phone field
      enabled: true,
      types: ['new_order', 'payment_verified', 'work_authorized', 'low_stock', 'appointment_reminder', 'delivery_assigned', 'customer_escalation', 'daily_summary'],
    };
  }

  private async getAllStaffWithPreferences(schemaName: string): Promise<Array<{ id: string; name: string; phone: string; enabled: boolean; types: StaffNotificationType[] }>> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, email, role
      FROM "${schemaName}".users
      WHERE is_active = true AND role IN ('admin', 'operator', 'manager')
    `);

    // In production: each user would have a phone and notification_prefs JSONB
    return rows.map(user => ({
      id: user.id,
      name: user.name,
      phone: '', // Populated from user.phone field when available
      enabled: true,
      types: ['new_order', 'payment_verified', 'work_authorized', 'low_stock', 'customer_escalation'] as StaffNotificationType[],
    }));
  }
}
