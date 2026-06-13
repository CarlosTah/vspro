'use client';

const orders = [
  { number: 'ORD-2026-00005', customer: 'Ana Martinez', status: 'new', total: '$25', time: 'Hace 5 min' },
  { number: 'ORD-2026-00004', customer: 'María López', status: 'payment_verified', total: '$150', time: 'Hace 20 min' },
  { number: 'ORD-2026-00003', customer: 'Carlos Ruiz', status: 'in_production', total: '$75', time: 'Hace 1 hora' },
  { number: 'ORD-2026-00002', customer: 'Laura Sánchez', status: 'ready', total: '$200', time: 'Hace 2 horas' },
];

const statusColors: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700',
  quoted: 'bg-purple-50 text-purple-700',
  payment_pending: 'bg-yellow-50 text-yellow-700',
  payment_verified: 'bg-green-50 text-green-700',
  in_production: 'bg-orange-50 text-orange-700',
  ready: 'bg-teal-50 text-teal-700',
  shipped: 'bg-indigo-50 text-indigo-700',
  delivered: 'bg-gray-50 text-gray-700',
  cancelled: 'bg-red-50 text-red-700',
};

const statusLabels: Record<string, string> = {
  new: 'Nuevo',
  quoted: 'Cotizado',
  payment_pending: 'Pago pendiente',
  payment_verified: 'Pago verificado',
  in_production: 'En producción',
  ready: 'Listo',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export function RecentOrders() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h3 className="font-semibold text-gray-900">Pedidos recientes</h3>
        <a href="/orders" className="text-sm text-brand-600 hover:text-brand-700">
          Ver todos →
        </a>
      </div>
      <div className="divide-y divide-gray-100">
        {orders.map((order) => (
          <div key={order.number} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{order.number}</p>
              <p className="text-xs text-gray-500">{order.customer} · {order.time}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-900">{order.total}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[order.status]}`}>
                {statusLabels[order.status]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
