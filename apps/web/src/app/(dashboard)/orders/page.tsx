'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/use-api';
import { TableSkeleton } from '@/components/ui/skeleton';

const statusColors: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700',
  quoted: 'bg-purple-50 text-purple-700',
  payment_pending: 'bg-yellow-50 text-yellow-700',
  payment_verified: 'bg-green-50 text-green-700',
  in_production: 'bg-orange-50 text-orange-700',
  ready: 'bg-teal-50 text-teal-700',
  shipped: 'bg-indigo-50 text-indigo-700',
  delivered: 'bg-gray-100 text-gray-700',
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

const FILTERS = [
  { label: 'Todos', value: '' },
  { label: 'Nuevos', value: 'new' },
  { label: 'Pago pendiente', value: 'payment_pending' },
  { label: 'En producción', value: 'in_production' },
  { label: 'Listos', value: 'ready' },
  { label: 'Enviados', value: 'shipped' },
];

export default function OrdersPage() {
  const [filter, setFilter] = useState('');
  const router = useRouter();
  const path = filter ? `/orders?status=${filter}` : '/orders';
  const { data: orders, loading, error } = useApi<any[]>(path);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-500">Gestiona todos los pedidos de tu negocio</p>
        </div>
        <button
          onClick={() => router.push('/orders/new')}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Nuevo pedido
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-brand-600 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:border-brand-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : error ? (
          <div className="p-8 text-center text-red-500">{error}</div>
        ) : orders && orders.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Pedido</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Cliente</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Estado</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Total</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order: any) => (
                <tr key={order.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/orders/${order.id}`)}>
                  <td className="px-5 py-3 font-medium text-gray-900">{order.orderNumber}</td>
                  <td className="px-5 py-3 text-gray-600">{order.customerName}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[order.status] ?? ''}`}>
                      {statusLabels[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium text-gray-900">${order.total}</td>
                  <td className="px-5 py-3 text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString('es-MX')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-400">No hay pedidos</div>
        )}
      </div>
    </div>
  );
}
