import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Integration: ShipmentService → AccountingService
 *
 * Trigger: shipment_created
 * Target: accounting_entries table
 *
 * When a shipment is created, this integration automatically generates
 * an accounting entry for the shipping cost, linking it to the order.
 *
 * Dependencies: ShipmentService, AccountingService
 * Tenant isolation: all operations scoped to schemaName.
 */
@Injectable()
export class AccountingShipmentIntegration {
  private readonly logger = new Logger(AccountingShipmentIntegration.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Handle shipment_created event.
   * Creates an accounting entry for the shipping cost.
   */
  async onShipmentCreated(event: ShipmentCreatedEvent): Promise<void> {
    const { orderId, schemaName, tenantId, shipmentId, carrier, trackingNumber } = event;

    // 1. Validate tenant isolation
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { schemaName: true, status: true },
    });

    if (!tenant || tenant.schemaName !== schemaName) {
      this.logger.error(`Tenant isolation violation in AccountingShipment: ${tenantId} / ${schemaName}`);
      return;
    }

    // 2. Get shipping cost from the order
    const orders = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT shipping_cost, order_number
      FROM "${schemaName}".orders
      WHERE id = $1::uuid
    `, orderId);

    if (!orders[0]) {
      this.logger.error(`[${schemaName}] Order ${orderId} not found for accounting entry`);
      return;
    }

    const shippingCost = parseFloat(orders[0].shipping_cost ?? '0');
    const orderNumber = orders[0].order_number;

    // 3. Skip if no shipping cost (free shipping)
    if (shippingCost <= 0) {
      this.logger.debug(`[${schemaName}] Order ${orderNumber}: free shipping — no accounting entry`);
      return;
    }

    // 4. Calculate tax (IVA 16% included in shipping cost for Mexico)
    const taxRate = 0.16;
    const subtotal = shippingCost / (1 + taxRate);
    const taxAmount = shippingCost - subtotal;

    // 5. Create accounting entry
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".accounting_entries
        (order_id, type, amount, tax_amount, description)
      VALUES ($1::uuid, 'shipping', $2, $3, $4)
    `,
      orderId,
      subtotal,
      taxAmount,
      `Envío ${carrier} (${trackingNumber}) — Pedido ${orderNumber}`,
    );

    this.logger.log(
      `[${schemaName}] Accounting entry created: shipping $${shippingCost.toFixed(2)} (subtotal $${subtotal.toFixed(2)} + IVA $${taxAmount.toFixed(2)}) for ${orderNumber}`,
    );
  }

  /**
   * Handle shipment_returned event.
   * Creates a refund/adjustment accounting entry for the shipping cost.
   */
  async onShipmentReturned(event: ShipmentReturnedEvent): Promise<void> {
    const { orderId, schemaName, tenantId, reason } = event;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { schemaName: true },
    });

    if (!tenant || tenant.schemaName !== schemaName) return;

    // Get original shipping cost
    const orders = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT shipping_cost, order_number FROM "${schemaName}".orders WHERE id = $1::uuid
    `, orderId);

    if (!orders[0]) return;

    const shippingCost = parseFloat(orders[0].shipping_cost ?? '0');
    if (shippingCost <= 0) return;

    const taxRate = 0.16;
    const subtotal = shippingCost / (1 + taxRate);
    const taxAmount = shippingCost - subtotal;

    // Create refund entry (negative amount)
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".accounting_entries
        (order_id, type, amount, tax_amount, description)
      VALUES ($1::uuid, 'refund', $2, $3, $4)
    `,
      orderId,
      -subtotal,
      -taxAmount,
      `Devolución envío — ${reason ?? 'Paquete retornado'} — Pedido ${orders[0].order_number}`,
    );

    this.logger.log(`[${schemaName}] Refund accounting entry for shipping on ${orders[0].order_number}`);
  }

  /**
   * Get shipping accounting summary for a tenant (dashboard).
   */
  async getShippingSummary(schemaName: string, period?: { from: string; to: string }): Promise<ShippingSummary> {
    const dateFilter = period
      ? `AND created_at >= '${period.from}'::date AND created_at < '${period.to}'::date`
      : '';

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) FILTER (WHERE type = 'shipping') AS total_shipments,
        COALESCE(SUM(amount) FILTER (WHERE type = 'shipping'), 0) AS total_shipping_revenue,
        COALESCE(SUM(tax_amount) FILTER (WHERE type = 'shipping'), 0) AS total_shipping_tax,
        COALESCE(SUM(amount) FILTER (WHERE type = 'refund' AND description LIKE '%envío%'), 0) AS total_refunds
      FROM "${schemaName}".accounting_entries
      WHERE type IN ('shipping', 'refund')
      ${dateFilter}
    `);

    const data = rows[0] ?? {};
    return {
      totalShipments: parseInt(data.total_shipments ?? '0'),
      totalRevenue: parseFloat(data.total_shipping_revenue ?? '0'),
      totalTax: parseFloat(data.total_shipping_tax ?? '0'),
      totalRefunds: Math.abs(parseFloat(data.total_refunds ?? '0')),
      netRevenue: parseFloat(data.total_shipping_revenue ?? '0') + parseFloat(data.total_refunds ?? '0'),
    };
  }
}

// ─── Event Types ────────────────────────────────────────────────

export interface ShipmentCreatedEvent {
  tenantId: string;
  schemaName: string;
  orderId: string;
  shipmentId: string;
  carrier: string;
  trackingNumber: string;
}

export interface ShipmentReturnedEvent {
  tenantId: string;
  schemaName: string;
  orderId: string;
  shipmentId: string;
  reason?: string;
}

export interface ShippingSummary {
  totalShipments: number;
  totalRevenue: number;
  totalTax: number;
  totalRefunds: number;
  netRevenue: number;
}
