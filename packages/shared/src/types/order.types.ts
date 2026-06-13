export type OrderStatus =
  | 'new'
  | 'quoted'
  | 'payment_pending'
  | 'payment_verified'
  | 'in_production'
  | 'ready'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  references?: string;
}
