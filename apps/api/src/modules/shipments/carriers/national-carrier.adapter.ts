import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CarrierAdapter,
  CreateShipmentParams,
  ShipmentCreated,
  TrackingStatus,
  RateParams,
  ShippingRate,
} from './carrier.interface';

/**
 * National carrier adapter (Estafeta, FedEx MX, DHL MX, etc.)
 * In development mode, simulates API responses.
 * In production, integrates with the configured carrier API.
 */
@Injectable()
export class NationalCarrierAdapter implements CarrierAdapter {
  private readonly logger = new Logger(NationalCarrierAdapter.name);

  readonly name = 'Paquetería Nacional';
  readonly code = 'national';

  constructor(private readonly config: ConfigService) {}

  async createShipment(params: CreateShipmentParams): Promise<ShipmentCreated> {
    // In production: call carrier API (Estafeta, FedEx, etc.)
    // For now: simulate
    const trackingNumber = `NAC-${Date.now().toString(36).toUpperCase()}`;

    this.logger.log(`[Simulated] National shipment created: ${trackingNumber} for order ${params.orderNumber}`);

    return {
      trackingNumber,
      trackingUrl: `https://rastreo.carrier.mx/${trackingNumber}`,
      carrier: this.code,
      estimatedDelivery: this.estimateDelivery(params.destination.state),
    };
  }

  async getTracking(trackingNumber: string): Promise<TrackingStatus> {
    // In production: call carrier tracking API
    return {
      trackingNumber,
      carrier: this.code,
      status: 'in_transit',
      lastUpdate: new Date().toISOString(),
      location: 'Centro de distribución CDMX',
      events: [
        { timestamp: new Date().toISOString(), status: 'in_transit', description: 'En camino', location: 'CDMX' },
        { timestamp: new Date(Date.now() - 86400000).toISOString(), status: 'picked_up', description: 'Recolectado' },
      ],
    };
  }

  async cancelShipment(trackingNumber: string): Promise<{ success: boolean; message: string }> {
    this.logger.log(`[Simulated] Cancelling national shipment: ${trackingNumber}`);
    return { success: true, message: 'Envío cancelado (simulado)' };
  }

  async getEstimatedDelivery(origin: string, destination: string): Promise<{ days: number }> {
    // Same state: 2-3 days, different state: 3-5 days
    const sameState = origin === destination;
    return { days: sameState ? 2 : 4 };
  }

  async calculateRate(params: RateParams): Promise<ShippingRate> {
    const totalWeight = params.packages.reduce((sum, p) => sum + p.weightKg, 0);
    const basePrice = 120;
    const perKg = 25;
    const price = basePrice + (totalWeight * perKg);

    return {
      carrier: this.code,
      service: 'Envío estándar nacional',
      price: Math.round(price),
      currency: 'MXN',
      estimatedDays: 4,
    };
  }

  private estimateDelivery(destinationState?: string): string {
    const days = destinationState === 'CDMX' ? 2 : 4;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }
}
