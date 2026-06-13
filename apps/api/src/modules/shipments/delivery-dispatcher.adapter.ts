import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Delivery Dispatcher Adapter — Last-mile logistics.
 *
 * Features:
 * - whatsapp-link-generator: Creates click-to-chat links for drivers
 * - driver-notification: Sends delivery assignments to drivers via WhatsApp
 *
 * Dependencies: ShipmentService
 *
 * Integrates with the tenant's delivery fleet (repartidores).
 * Each tenant can configure their drivers in a drivers table or JSONB config.
 */
@Injectable()
export class DeliveryDispatcherAdapter {
  private readonly logger = new Logger(DeliveryDispatcherAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a WhatsApp click-to-chat link for a driver assignment.
   * Pre-fills the message with delivery details.
   */
  generateDriverWhatsAppLink(params: DriverAssignment): string {
    const message = this.buildDriverMessage(params);
    const encoded = encodeURIComponent(message);
    const phone = params.driverPhone.replace(/\D/g, '');

    return `https://wa.me/${phone}?text=${encoded}`;
  }

  /**
   * Generate a customer tracking link via WhatsApp.
   * Sends the customer a message with their delivery status.
   */
  generateCustomerTrackingLink(params: CustomerTracking): string {
    const message = this.buildCustomerMessage(params);
    const encoded = encodeURIComponent(message);
    const phone = params.customerPhone.replace(/\D/g, '');

    return `https://wa.me/${phone}?text=${encoded}`;
  }

  /**
   * Dispatch a delivery to a driver.
   * Creates the assignment record and generates notification links.
   */
  async dispatchDelivery(
    orderId: string,
    driverPhone: string,
    driverName: string,
    schemaName: string,
  ): Promise<DispatchResult> {
    // Get order + customer + shipment details
    const orders = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.order_number, o.shipping_address, o.total,
             c.name AS customer_name, c.phone AS customer_phone,
             s.tracking_number, s.carrier
      FROM "${schemaName}".orders o
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      LEFT JOIN "${schemaName}".shipments s ON s.order_id = o.id
      WHERE o.id = $1::uuid
    `, orderId);

    if (!orders[0]) {
      return { success: false, error: 'Order not found' };
    }

    const order = orders[0];
    const address = order.shipping_address ?? {};

    const assignment: DriverAssignment = {
      driverName,
      driverPhone,
      orderNumber: order.order_number,
      customerName: order.customer_name,
      customerPhone: order.customer_phone ?? '',
      deliveryAddress: `${address.street ?? ''}, ${address.city ?? ''} ${address.zip ?? ''}`.trim(),
      total: parseFloat(order.total),
      trackingNumber: order.tracking_number,
      notes: '',
    };

    // Generate links
    const driverLink = this.generateDriverWhatsAppLink(assignment);
    const customerLink = this.generateCustomerTrackingLink({
      customerPhone: order.customer_phone ?? '',
      customerName: order.customer_name,
      orderNumber: order.order_number,
      driverName,
      driverPhone,
      estimatedTime: '30-60 minutos',
    });

    // Log the dispatch
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".shipments
      SET status = 'out_for_delivery'
      WHERE order_id = $1::uuid
    `, orderId);

    this.logger.log(`[${schemaName}] Delivery dispatched: ${order.order_number} → ${driverName} (${driverPhone})`);

    return {
      success: true,
      driverWhatsAppLink: driverLink,
      customerWhatsAppLink: customerLink,
      assignment,
    };
  }

  /**
   * Get available drivers for a tenant (from config or dedicated table).
   */
  async getDrivers(schemaName: string): Promise<Driver[]> {
    // Check if tenant has drivers configured in ai_config
    const config = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT agent_config->'delivery_drivers' AS drivers
      FROM "${schemaName}".ai_config LIMIT 1
    `);

    const drivers = config[0]?.drivers;
    if (Array.isArray(drivers)) return drivers;

    // Default: no drivers configured
    return [];
  }

  // ─── Message Builders ─────────────────────────────────────────

  private buildDriverMessage(params: DriverAssignment): string {
    return `🚚 *Nueva entrega asignada*\n\n` +
      `📋 Pedido: ${params.orderNumber}\n` +
      `👤 Cliente: ${params.customerName}\n` +
      `📍 Dirección: ${params.deliveryAddress}\n` +
      `💰 Total: $${params.total.toLocaleString()}\n` +
      `📞 Tel cliente: ${params.customerPhone}\n` +
      (params.trackingNumber ? `🔢 Guía: ${params.trackingNumber}\n` : '') +
      (params.notes ? `📝 Notas: ${params.notes}\n` : '') +
      `\n¡Confirma cuando recojas el paquete!`;
  }

  private buildCustomerMessage(params: CustomerTracking): string {
    return `📦 *Tu pedido está en camino*\n\n` +
      `Hola ${params.customerName}, tu pedido ${params.orderNumber} ` +
      `ya salió con nuestro repartidor ${params.driverName}.\n\n` +
      `⏱️ Tiempo estimado: ${params.estimatedTime}\n` +
      `📞 Contacto repartidor: ${params.driverPhone}\n\n` +
      `¡Te avisamos cuando llegue!`;
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface DriverAssignment {
  driverName: string;
  driverPhone: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  total: number;
  trackingNumber?: string;
  notes?: string;
}

export interface CustomerTracking {
  customerPhone: string;
  customerName: string;
  orderNumber: string;
  driverName: string;
  driverPhone: string;
  estimatedTime: string;
}

export interface Driver {
  name: string;
  phone: string;
  zone?: string;
  active: boolean;
}

export interface DispatchResult {
  success: boolean;
  error?: string;
  driverWhatsAppLink?: string;
  customerWhatsAppLink?: string;
  assignment?: DriverAssignment;
}
