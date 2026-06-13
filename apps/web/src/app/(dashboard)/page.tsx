'use client';

import { useApi } from '@/hooks/use-api';
import { CardSkeleton } from '@/components/ui/skeleton';

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

export default function DashboardPage() {
  const { data, loading } = useApi<any>('/dashboard/stats');

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
      </div>
    );
  }

  const stats = data?.stats ?? { ordersToday: 0, inProduction: 0, readyForShipment: 0, salesToday: 0 };
  const recentOrders = data?.recentOrders ?? [];
  const productionQueue = data?.productionQueue ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Resumen de tu negocio hoy</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="📋" label="Pedidos hoy" value={stats.ordersToday} />
        <StatCard icon="🏭" label="En producción" value={stats.inProduction} />
        <StatCard icon="📦" label="Listos para envío" value={stats.readyForShipment} />
        <StatCard icon="💰" label="Ventas del día" value={`$${Number(stats.salesToday).toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pedidos recientes */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="font-semibold text-gray-900">Pedidos recientes</h3>
            <a href="/orders" className="text-sm text-blue-600 hover:text-blue-700">Ver todos →</a>
          </div>
          <div className="divide-y divide-gray-100">
            {recentOrders.length === 0 ? (
              <p className="p-5 text-sm text-gray-400 text-center">No hay pedidos aún</p>
            ) : (
              recentOrders.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{order.orderNumber}</p>
                    <p className="text-xs text-gray-500">{order.customerName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">${order.total}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[order.status] ?? ''}`}>
                      {statusLabels[order.status] ?? order.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Cola de producción */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h3 className="font-semibold text-gray-900">Cola de producción</h3>
            <a href="/production" className="text-sm text-blue-600 hover:text-blue-700">Ver cola →</a>
          </div>
          <div className="divide-y divide-gray-100">
            {productionQueue.length === 0 ? (
              <p className="p-5 text-sm text-gray-400 text-center">Sin pedidos en producción</p>
            ) : (
              productionQueue.map((item: any) => {
                const items = typeof item.items === 'string' ? JSON.parse(item.items) : item.items;
                const itemsSummary = items?.map((i: any) => `${i.quantity}x ${i.productName}`).join(', ') ?? '';
                return (
                  <div key={item.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{item.orderNumber}</p>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        item.status === 'payment_verified' ? 'bg-yellow-50 text-yellow-700' : 'bg-orange-50 text-orange-700'
                      }`}>
                        {item.status === 'payment_verified' ? 'Pendiente' : 'En proceso'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{itemsSummary}</p>
                    <p className="text-xs text-gray-400">
                      {item.assignedToName ? `Asignado a: ${item.assignedToName}` : 'Sin asignar'}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <span className="text-2xl">{icon}</span>
      <p className="mt-3 text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
