'use client';

import { useApi } from '@/hooks/use-api';

interface Props {
  period: string;
}

export function PerformanceCharts({ period }: Props) {
  const { data, loading } = useApi<any>(`/reports/performance?period=${period}`);

  if (loading) return <LoadingSkeleton />;
  if (!data) return <p className="text-gray-400">No hay datos disponibles</p>;

  const { fulfillment, ai, products, channels } = data;

  return (
    <div className="space-y-6">
      {/* Fulfillment Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard icon="⏱️" label="Tiempo promedio a envío" value={`${fulfillment.averageTimeToShip.toFixed(1)}h`} />
        <MetricCard icon="📦" label="Backlog producción" value={fulfillment.productionBacklog} />
        <MetricCard icon="✅" label="Entrega a tiempo" value={`${fulfillment.onTimeDeliveryRate}%`} />
        <MetricCard icon="🚚" label="Tiempo a entrega" value={`${fulfillment.averageTimeToDeliver.toFixed(1)}h`} />
      </div>

      {/* AI Automation */}
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">🤖 Automatización IA</h3>
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
          <div>
            <p className="text-2xl font-bold text-purple-400">{ai.automationRate}%</p>
            <p className="text-xs text-gray-400">Tasa de automatización</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{ai.totalMessages}</p>
            <p className="text-xs text-gray-400">Mensajes totales</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-400">{ai.aiHandled}</p>
            <p className="text-xs text-gray-400">Manejados por IA</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-400">{ai.humanEscalated}</p>
            <p className="text-xs text-gray-400">Escalados a humano</p>
          </div>
        </div>
        {/* Automation bar */}
        <div className="mt-4 h-3 rounded-full bg-gray-700 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all"
            style={{ width: `${ai.automationRate}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>IA: {ai.aiHandled}</span>
          <span>Humano: {ai.humanEscalated}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Products */}
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">🏆 Productos más vendidos</h3>
          {products.topSelling.length === 0 ? (
            <p className="text-sm text-gray-500">Sin datos en este período</p>
          ) : (
            <div className="space-y-2">
              {products.topSelling.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-4">{i + 1}.</span>
                    <span className="text-sm text-white">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">{p.quantity} uds</span>
                    <span className="text-sm font-medium text-green-400">${p.revenue.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock Alerts */}
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-300">⚠️ Stock bajo</h3>
            {products.outOfStock > 0 && (
              <span className="rounded-full bg-red-900/50 border border-red-700 px-2 py-0.5 text-xs text-red-300">
                {products.outOfStock} agotados
              </span>
            )}
          </div>
          {products.lowStock.length === 0 ? (
            <p className="text-sm text-gray-500">Todo en niveles normales ✅</p>
          ) : (
            <div className="space-y-2">
              {products.lowStock.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1">
                  <div>
                    <span className="text-sm text-white">{p.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{p.sku}</span>
                  </div>
                  <span className={`text-sm font-medium ${p.stock === 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                    {p.stock}/{p.minimum}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Channel Breakdown */}
      {channels?.byChannel && Object.keys(channels.byChannel).length > 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">📱 Rendimiento por canal</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Object.entries(channels.byChannel).map(([channel, data]: [string, any]) => (
              <div key={channel} className="rounded-lg bg-gray-900 p-4">
                <p className="text-sm font-medium text-white capitalize">{channel}</p>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Mensajes</span>
                    <span className="text-white">{data.messages}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Pedidos</span>
                    <span className="text-white">{data.orders}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Ingresos</span>
                    <span className="text-green-400">${data.revenue.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <span className="text-lg">{icon}</span>
      <p className="text-xl font-bold text-white mt-2">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-gray-800" />)}
      </div>
      <div className="h-40 rounded-xl bg-gray-800" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-48 rounded-xl bg-gray-800" />
        <div className="h-48 rounded-xl bg-gray-800" />
      </div>
    </div>
  );
}
