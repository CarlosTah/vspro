/**
 * Carrier Adapter Interface — Strategy Pattern.
 * Each shipping carrier implements this interface.
 * Allows adding new carriers without modifying ShipmentService.
 */
export interface CarrierAdapter {
  readonly name: string;
  readonly code: string;

  /** Create a shipment label and get tracking number */
  createShipment(params: CreateShipmentParams): Promise<ShipmentCreated>;

  /** Get current tracking status */
  getTracking(trackingNumber: string): Promise<TrackingStatus>;

  /** Cancel a shipment (if supported) */
  cancelShipment(trackingNumber: string): Promise<{ success: boolean; message: string }>;

  /** Get estimated delivery date */
  getEstimatedDelivery(origin: string, destination: string): Promise<{ days: number }>;

  /** Calculate shipping rate */
  calculateRate(params: RateParams): Promise<ShippingRate>;
}

// ─── DTOs ───────────────────────────────────────────────────────

export interface CreateShipmentParams {
  orderId: string;
  orderNumber: string;
  origin: ShipmentAddress;
  destination: ShipmentAddress;
  packages: PackageInfo[];
  serviceType?: string;
}

export interface ShipmentAddress {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  phone?: string;
}

export interface PackageInfo {
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  description?: string;
}

export interface ShipmentCreated {
  trackingNumber: string;
  trackingUrl: string;
  labelUrl?: string;
  carrier: string;
  estimatedDelivery?: string;
}

export interface TrackingStatus {
  trackingNumber: string;
  carrier: string;
  status: ShipmentStatus;
  lastUpdate: string;
  location?: string;
  events: TrackingEvent[];
}

export interface TrackingEvent {
  timestamp: string;
  status: string;
  description: string;
  location?: string;
}

export type ShipmentStatus =
  | 'pending'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'returned'
  | 'exception';

export interface RateParams {
  origin: { zip: string; country?: string };
  destination: { zip: string; country?: string };
  packages: PackageInfo[];
}

export interface ShippingRate {
  carrier: string;
  service: string;
  price: number;
  currency: string;
  estimatedDays: number;
}
