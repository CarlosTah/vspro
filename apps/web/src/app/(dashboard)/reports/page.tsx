'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const getDateRange = () => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    switch (period) {
      case 'today': return { from: today, to: today };
      case 'yesterday': return { from: yesterday, to: yesterday };
      case 'week': return { from: weekAgo, to: today };
      case 'month': return { from: monthStart, to: today };
      case 'custom': return { from: customFrom || today, to: customTo || today };
    }
  };

  const range = getDateRange();
  const { data: report, loading } = useApi<any>(`/reports/summary?from=${range.from}&to=${range.to}`);

  const orders = report?.orders ?? {};
  const revenue = report?.revenue ?? {};
  const customers = report?.customers ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Reportes</h1>
          <p className="text-sm text-gray-400">Análisis de ventas y rendimiento</p>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: 'today', label: 'Hoy' },
          { key: 'yesterday', label: 'Ayer' },
          { key: 'week', label: 'Semana' },
          { key: 'month', label: 'Mes' },
          { key: 'custom', label: 'Rango' },
        ] as { key: Period; label: string }[]).map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === p.key ? 'bg-accent text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}

        {period === 'custom' && (
          <div className="flex gap-2 ml-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="vspro-input text-sm w-40" />
            <span className="text-gray-500 self-center">→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="vspro-input text-sm w-40" />
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Cargando reportes...</div>
      ) : (
        <>
          {/* Main stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon="💰" label="Revenue" value={`$${Number(revenue.total ?? 0).toLocaleString('es-MX')}`} sub="MXN" color="text-green-400" />
            <StatCard icon="📋" label="Pedidos" value={orders.total ?? 0} sub={`Entregados: ${orders.delivered ?? 0}`} color="text-blue-400" />
            <StatCard icon="🎟️" label="Ticket promedio" value={`$${orders.total > 0 ? Math.round((revenue.total ?? 0) / orders.total).toLocaleString('es-MX') : '0'}`} sub="por pedido" color="text-purple-400" />
            <StatCard icon="👥" label="Clientes" value={customers.newInPeriod ?? customers.total ?? 0} sub="en el período" color="text-cyan-400" />
          </div>

          {/* Revenue breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Paid vs Pending */}
            <div className="rounded-xl border border-card-border bg-card p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">💳 Cobros</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Cobrado</span>
                  <span className="text-sm font-bold text-green-400">${Number(revenue.paid ?? 0).toLocaleString('es-MX')}</span>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${revenue.total > 0 ? ((revenue.paid ?? 0) / revenue.total * 100) : 0}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Pendiente</span>
                  <span className="text-sm font-bold text-yellow-400">${Number(revenue.pending ?? 0).toLocaleString('es-MX')}</span>
                </div>
              </div>
            </div>

            {/* Orders by status */}
            <div className="rounded-xl border border-card-border bg-card p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">📊 Pedidos por estado</h3>
              <div className="space-y-2">
                {[
                  { label: 'Nuevos', value: orders.new ?? 0, color: 'bg-blue-500' },
                  { label: 'En producción', value: orders.inProduction ?? 0, color: 'bg-orange-500' },
                  { label: 'Enviados', value: orders.shipped ?? 0, color: 'bg-indigo-500' },
                  { label: 'Entregados', value: orders.delivered ?? 0, color: 'bg-green-500' },
                  { label: 'Cancelados', value: orders.cancelled ?? 0, color: 'bg-red-500' },
                ].filter(s => s.value > 0).map(s => (
                  <div key={s.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                      <span className="text-sm text-gray-300">{s.label}</span>
                    </div>
                    <span className="text-sm font-medium text-white">{s.value}</span>
                  </div>
                ))}
                {orders.total === 0 && <p className="text-sm text-gray-500">Sin pedidos en este período</p>}
              </div>
            </div>
          </div>

          {/* Conversations */}
          <div className="rounded-xl border border-card-border bg-card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">💬 Conversaciones</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{report?.conversations?.total ?? 0}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-400">{report?.conversations?.active ?? 0}</p>
                <p className="text-xs text-gray-500">Activas</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-400">{report?.conversations?.resolved ?? 0}</p>
                <p className="text-xs text-gray-500">Resueltas</p>
              </div>
            </div>
          </div>

          {/* Cancellation Metrics */}
          <CancellationMetrics />
        </>
      )}
    </div>
  );
}

function CancellationMetrics() {
  const { data: metrics } = useApi<any>('/orders/analytics/cancellations');

  if (!metrics) return null;

  return (
    <div className="space-y-4 pt-4 border-t border-gray-700">
      <h3 className="text-lg font-semibold text-white">❌ Cancelaciones</h3>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-2xl font-bold text-red-400">{metrics.overall.cancellationRate}%</p>
          <p className="text-xs text-gray-400">Tasa de cancelación</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-2xl font-bold text-white">{metrics.overall.cancelledOrders}</p>
          <p className="text-xs text-gray-400">Total cancelados</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-2xl font-bold text-red-300">${metrics.overall.lostRevenue.toLocaleString('es-MX')}</p>
          <p className="text-xs text-gray-400">Revenue perdido</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-2xl font-bold text-yellow-300">{metrics.thisMonth.cancelledOrders}</p>
          <p className="text-xs text-gray-400">Cancelados este mes</p>
        </div>
      </div>

      {/* Reasons */}
      {metrics.reasons.length > 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Motivos frecuentes</h4>
          <div className="space-y-2">
            {metrics.reasons.map((r: any) => {
              const maxCount = Math.max(...metrics.reasons.map((x: any) => x.count), 1);
              return (
                <div key={r.reason} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-36 truncate">{r.reason}</span>
                  <div className="flex-1 bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-red-500 rounded-full h-2"
                      style={{ width: `${(r.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-8 text-right">{r.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent cancellations */}
      {metrics.recent.length > 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <h4 className="text-sm font-medium text-gray-300">Últimas cancelaciones</h4>
          </div>
          <div className="divide-y divide-gray-700/50">
            {metrics.recent.map((r: any) => (
              <div key={r.orderNumber} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <span className="text-xs text-white font-mono">#{r.orderNumber}</span>
                  <span className="text-xs text-gray-400 ml-2">{r.customerName}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-red-400">${r.total.toLocaleString('es-MX')}</span>
                  <p className="text-[10px] text-gray-500">{r.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: string; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-5">
      <span className="text-xl">{icon}</span>
      <p className={`text-2xl font-bold mt-2 ${color}`}>{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
