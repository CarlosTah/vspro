import { OrderStatus } from '../types/order.types';

/**
 * Transiciones de estado válidas para un pedido.
 * Clave: estado actual → Valor: estados a los que puede transicionar.
 *
 * El sistema rechaza cualquier transición que no esté en este mapa.
 */
export const ORDER_STATE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ['quoted', 'cancelled'],
  quoted: ['payment_pending', 'cancelled'],
  payment_pending: ['payment_verified', 'cancelled'],
  payment_verified: ['in_production', 'cancelled'],
  in_production: ['ready'],
  ready: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Estados que indican que el pedido está activo (no terminal) */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'new',
  'quoted',
  'payment_pending',
  'payment_verified',
  'in_production',
  'ready',
  'shipped',
];

/** Estados terminales — el pedido no puede cambiar más */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ['delivered', 'cancelled'];
