import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CarrierAdapter, CreateShipmentParams, TrackingStatus, ShippingRate, RateParams } from './carriers/carrier.interface';
import { LocalCarrierAdapter } from './carriers/local-carrier.adapter';
import { NationalCarrierAdapter } from './carriers/national-carrier.adapter';

/**
 * ShipmentService — manages shipment lifecycle with carrier adapters.
 *
 * Features:
 * - Tracking: real-time status via carrier adapters
 * - Carrier Adapter: Strategy pattern for multiple carriers
 *
 * Dependencies:
 * - ProductionService: shipments are created after production is complete (order status = 'ready')
 *
 * Tenant isolation: all DB operations scoped to schemaName.
 */
@Injectable()
export class ShipmentTrackingService {
  private readonly logger = new Logger(ShipmentTrackingService.name);
  private readonly carriers: Map<string, CarrierAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly localCarrier: LocalCarrierAdapter,
    private readonly nationalCarrier: NationalCarrierAdapter,
  ) {
    this.carriers = new Map<string, CarrierAdapter>([
      ['local', this.localCarrier],
      ['national', this.nationalCarrier],
    ]);
  }

  // ─── Shipment Creation ────────────────────────────────────────

  /**
   * Create a shipment for an order that is ready for shipping.
   * Validates order is in 'ready' state (post-production).
   */
  async createShipment(
    orderId: string,
    carrierCode: string,
    destination: CreateShipmentParams['destination'],
    schemaName: string,
  ): Promise<{ shipmentId: string; trackingNumber: string; trackingUrl: string }> {
    // Validate carrier
    const carrier = this.carriers.get(carrierCode);
    if (!carrier) {
      throw new BadRequestException(
        `Carrier '${carrierCode}' not supported. Available: ${[...this.carriers.keys()].join(', ')}`,
      );
    }

    // Validate order state
    const orders = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.id, o.order_number, o.status, o.shipping_address,
             c.name AS customer_name, c.phone AS customer_phone
      FROM "${schemaName}".orders o
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      WHERE o.id = $1::uuid
    `, orderId);

    if (!orders[0]) throw new NotFoundException('Order not found');

    const order = orders[0];
    if (order.status !== 'ready' && order.status !== 'paid') {
      throw new BadRequestException(`Order must be in 'ready' state to ship. Current: '${order.status}'`);
    }

    // Create shipment via carrier adapter
    const params: CreateShipmentParams = {
      orderId: order.id,
      orderNumber: order.order_number,
      origin: { name: 'Almacén', street: '', city: '', state: '', zip: '06600' }, // TODO: from tenant config
      destination,
      packages: [{ weightKg: 1.0, description: `Pedido ${order.order_number}` }],
    };

    const result = await carrier.createShipment(params);

    // Persist shipment record
    const shipments = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".shipments
        (order_id, carrier, tracking_number, tracking_url, status, estimated_delivery)
      VALUES ($1::uuid, $2, $3, $4, 'pending', $5::date)
      RETURNING id
    `, orderId, carrier.name, result.trackingNumber, result.trackingUrl, result.estimatedDelivery ?? null);

    // Transition order to shipped
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".orders
      SET status = 'shipped', updated_at = NOW()
      WHERE id = $1::uuid
    `, orderId);

    this.logger.log(`[${schemaName}] Shipment created: ${result.trackingNumber} via ${carrier.name} for ${order.order_number}`);

    return {
      shipmentId: shipments[0].id,
      trackingNumber: result.trackingNumber,
      trackingUrl: result.trackingUrl,
    };
  }

  // ─── Tracking ─────────────────────────────────────────────────

  /**
   * Get real-time tracking status for a shipment.
   */
  async getTracking(shipmentId: string, schemaName: string): Promise<TrackingStatus> {
    const shipments = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT carrier, tracking_number AS "trackingNumber"
      FROM "${schemaName}".shipments WHERE id = $1::uuid
    `, shipmentId);

    if (!shipments[0]) throw new NotFoundException('Shipment not found');

    const carrierCode = this.resolveCarrierCode(shipments[0].carrier);
    const carrier = this.carriers.get(carrierCode);

    if (!carrier) {
      return {
        trackingNumber: shipments[0].trackingNumber,
        carrier: shipments[0].carrier,
        status: 'pending',
        lastUpdate: new Date().toISOString(),
        events: [],
      };
    }

    return carrier.getTracking(shipments[0].trackingNumber);
  }

  /**
   * Get tracking by order ID (for customer-facing queries).
   */
  async getTrackingByOrder(orderId: string, schemaName: string): Promise<TrackingStatus | null> {
    const shipments = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id FROM "${schemaName}".shipments
      WHERE order_id = $1::uuid
      ORDER BY created_at DESC LIMIT 1
    `, orderId);

    if (!shipments[0]) return null;
    return this.getTracking(shipments[0].id, schemaName);
  }

  /**
   * Update shipment status (webhook from carrier or manual).
   */
  async updateStatus(
    shipmentId: string,
    status: string,
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".shipments
      SET status = $1
      WHERE id = $2::uuid
    `, status, shipmentId);

    // If delivered, update order status too
    if (status === 'delivered') {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".orders
        SET status = 'delivered', updated_at = NOW()
        WHERE id = (SELECT order_id FROM "${schemaName}".shipments WHERE id = $1::uuid)
      `, shipmentId);
    }
  }

  // ─── Rate Calculation ─────────────────────────────────────────

  /**
   * Get shipping rates from all available carriers.
   */
  async getRates(params: RateParams, _schemaName: string): Promise<ShippingRate[]> {
    const rates: ShippingRate[] = [];

    for (const carrier of this.carriers.values()) {
      try {
        const rate = await carrier.calculateRate(params);
        rates.push(rate);
      } catch (err: any) {
        this.logger.warn(`Rate calculation failed for ${carrier.code}: ${err.message}`);
      }
    }

    return rates.sort((a, b) => a.price - b.price);
  }

  // ─── Available Carriers ───────────────────────────────────────

  getAvailableCarriers(): Array<{ code: string; name: string }> {
    return [...this.carriers.entries()].map(([code, carrier]) => ({
      code,
      name: carrier.name,
    }));
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private resolveCarrierCode(carrierName: string): string {
    for (const [code, carrier] of this.carriers) {
      if (carrier.name === carrierName || code === carrierName.toLowerCase()) return code;
    }
    return 'local';
  }
}
