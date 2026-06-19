'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { CardSkeleton } from '@/components/ui/skeleton';

const statusColors: Record<string, string> = {
  new: 'bg-blue-900/40 text-blue-300',
  payment_pending: 'bg-yellow-900/40 text-yellow-300',
  payment_verified: 'bg-green-900/40 text-green-300',
  in_production: 'bg-orange-900/40 text-orange-300',
  ready: 'bg-teal-900/40 text-teal-300',
  shipped: 'bg-indigo-900/40 text-indigo-300',
  delivered: 'bg-gray-700/40 text-gray-300',
  cancelled: 'bg-red-900/40 text-red-300',
};

const statusLabels: Record<string, string> = {
  new: 'Nuevo', payment_pending: 'Pago pendiente', payment_verified: 'Pagado',
  in_production: 'En producción', ready: 'Listo', shipped: 'Enviado',
  delivered: 'Entregado', cancelled: 'Cancelado',
};

type Period = 'today' | 'week' | 'month';

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('today');
  const { data, loading } = useApi<any>('/dashboard/stats');
  const { data: reportData } = useApi<any>(`/reports/summary?period=${period}`);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
      </div>
    );
  }

  const stats = data?.stats ?? { ordersToday: 0, inProduction: 0, readyForShipment: 0, salesToday: 0 };
  const recentOrders = data?.recentOrders ?? [];
  const report = reportData ?? {};
  const revenue = report.revenue ?? 0;
  const orderCount = report.orders ?? 0;
  const avgTicket = orderCount > 0 ? revenue / orderCount : 0;
  const collected = report.collected ?? 0;
  const pending = report.pending ?? 0;
  const newCustomers = report.newCustomers ?? 0;
  const topProducts = report.topProducts ?? [];

  const periodLabels: Record<Period, string> = { today: 'Hoy', week: 'Esta semana', month: 'Este mes' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-400">Resumen de tu negocio</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-800 p-1">
          {(['today', 'week', 'month'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                period === p ? 'bg-accent text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon="💰"
          label="Ventas"
          value={`$${Number(revenue).toLocaleString('es-MX')}`}
          subtitle={periodLabels[period]}
          accent
        />
        <StatCard
          icon="📋"
          label="Pedidos"
          value={orderCount}
          subtitle={`Ticket prom: $${Math.round(avgTicket).toLocaleString('es-MX')}`}
        />
        <StatCard
          icon="✅"
          label="Cobrado"
          value={`$${Number(collected).toLocaleString('es-MX')}`}
          subtitle={pending > 0 ? `$${Number(pending).toLocaleString()} pendiente` : 'Todo cobrado'}
        />
        <StatCard
          icon="👥"
          label="Nuevos clientes"
          value={newCustomers}
          subtitle={periodLabels[period]}
        />
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="En producción" value={stats.inProduction} color="orange" />
        <MiniStat label="Listos para envío" value={stats.readyForShipment} color="teal" />
        <MiniStat label="Pedidos hoy" value={stats.ordersToday} color="blue" />
        <MiniStat label="Ventas hoy" value={`$${Number(stats.salesToday).toLocaleString()}`} color="green" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Top Products */}
        <div className="rounded-xl border border-card-border bg-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">🏆 Top Productos</h3>
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Sin datos en este período</p>
          ) : (
            <div className="space-y-3">
              {topProducts.slice(0, 5).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 w-4">{i + 1}</span>
                    <span className="text-sm text-white">{p.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-accent font-medium">{p.quantity} uds</span>
                    <p className="text-xs text-gray-500">${Number(p.revenue ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="lg:col-span-2 rounded-xl border border-card-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-300">📋 Pedidos recientes</h3>
            <a href="/orders" className="text-xs text-accent hover:underline">Ver todos →</a>
          </div>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No hay pedidos aún</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.slice(0, 6).map((order: any) => (
                <a
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[order.status] ?? ''}`}>
                      {statusLabels[order.status] ?? order.status}
                    </span>
                    <div>
                      <p className="text-sm text-white font-medium">{order.orderNumber}</p>
                      <p className="text-xs text-gray-400">{order.customerName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white font-medium">${Number(order.total).toLocaleString('es-MX')}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subtitle, accent }: {
  icon: string; label: string; value: string | number; subtitle?: string; accent?: boolean;
}) {
  return (
    <div className={`vspro-stat-card ${accent ? 'border-accent/30' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        {accent && <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
      </div>
      <p className={`mt-3 text-2xl font-bold ${accent ? 'text-accent' : 'text-white'}`}>{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    orange: 'border-orange-500/30 text-orange-300',
    teal: 'border-teal-500/30 text-teal-300',
    blue: 'border-blue-500/30 text-blue-300',
    green: 'border-green-500/30 text-green-300',
  };
  return (
    <div className={`rounded-lg border bg-card/50 p-3 ${colorMap[color] ?? ''}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
