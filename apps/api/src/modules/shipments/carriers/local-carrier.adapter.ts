import { Injectable, Logger } from '@nestjs/common';
import {
  CarrierAdapter,
  CreateShipmentParams,
  ShipmentCreated,
  TrackingStatus,
  RateParams,
  ShippingRate,
} from './carrier.interface';

/**
 * Local/Manual carrier adapter.
 * Used for local deliveries, same-city couriers, or manual tracking.
 * Generates internal tracking numbers without external API calls.
 */
@Injectable()
export class LocalCarrierAdapter implements CarrierAdapter {
  private readonly logger = new Logger(LocalCarrierAdapter.name);

  readonly name = 'Envío Local';
  readonly code = 'local';

  async createShipment(params: CreateShipmentParams): Promise<ShipmentCreated> {
    const trackingNumber = `LOC-${Date.now().toString(36).toUpperCase()}`;

    return {
      trackingNumber,
      trackingUrl: `https://vspro.app/track/${trackingNumber}`,
      carrier: this.code,
      estimatedDelivery: this.estimateDelivery(),
    };
  }

  async getTracking(trackingNumber: string): Promise<TrackingStatus> {
    return {
      trackingNumber,
      carrier: this.code,
      status: 'in_transit',
      lastUpdate: new Date().toISOString(),
      events: [
        { timestamp: new Date().toISOString(), status: 'created', description: 'Envío registrado' },
      ],
    };
  }

  async cancelShipment(_trackingNumber: string): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'Envío local cancelado' };
  }

  async getEstimatedDelivery(_origin: string, _destination: string): Promise<{ days: number }> {
    return { days: 1 };
  }

  async calculateRate(_params: RateParams): Promise<ShippingRate> {
    return {
      carrier: this.code,
      service: 'Entrega local mismo día',
      price: 50,
      currency: 'MXN',
      estimatedDays: 1,
    };
  }

  private estimateDelivery(): string {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }
}
