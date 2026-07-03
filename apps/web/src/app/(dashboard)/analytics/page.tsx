'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { CardSkeleton } from '@/components/ui/skeleton';

type Period = 'today' | 'week' | 'month';

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('week');
  const { data, loading } = useApi<any>(`/analytics/conversion?period=${period}`);

  const periodLabels: Record<Period, string> = {
    today: 'Hoy',
    week: 'Esta semana',
    month: 'Este mes',
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
      </div>
    );
  }

  const funnel = data?.funnel ?? { conversations: 0, ordersCreated: 0, ordersPaid: 0, convToOrderRate: 0, orderToPayRate: 0 };
  const daily = data?.dailyBreakdown ?? [];
  const channels = data?.channelBreakdown ?? [];
  const avgResponse = data?.avgResponseTime ?? 0;
  const avgCompletion = data?.avgOrderCompletionTime ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-gray-400">Embudo de conversión y rendimiento</p>
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

      {/* Funnel Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <FunnelCard
          label="Conversaciones"
          value={funnel.conversations}
          icon="💬"
        />
        <FunnelCard
          label="Pedidos creados"
          value={funnel.ordersCreated}
          icon="📋"
          rate={funnel.convToOrderRate}
          rateLabel="de conversaciones"
        />
        <FunnelCard
          label="Pedidos pagados"
          value={funnel.ordersPaid}
          icon="✅"
          rate={funnel.orderToPayRate}
          rateLabel="de pedidos"
        />
        <FunnelCard
          label="Tiempo respuesta"
          value={formatTime(avgResponse)}
          icon="⚡"
          subtitle="promedio"
        />
        <FunnelCard
          label="Tiempo a pedido"
          value={`${avgCompletion} min`}
          icon="🎯"
          subtitle="conversación → orden"
        />
      </div>

      {/* Conversion Rate Visual */}
      <div className="rounded-xl border border-card-border bg-card p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Embudo de conversión</h3>
        <div className="flex items-center gap-4">
          <FunnelBar label="Conversaciones" value={funnel.conversations} max={funnel.conversations} color="bg-blue-500" />
          <span className="text-gray-500 text-lg">→</span>
          <FunnelBar label="Pedidos" value={funnel.ordersCreated} max={funnel.conversations} color="bg-yellow-500" />
          <span className="text-gray-500 text-lg">→</span>
          <FunnelBar label="Pagados" value={funnel.ordersPaid} max={funnel.conversations} color="bg-green-500" />
        </div>
        <div className="mt-4 flex items-center gap-6 text-sm">
          <span className="text-gray-400">
            Tasa conversación → pedido: <span className="text-white font-bold">{funnel.convToOrderRate}%</span>
          </span>
          <span className="text-gray-400">
            Tasa pedido → pago: <span className="text-white font-bold">{funnel.orderToPayRate}%</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Daily Breakdown */}
        <div className="lg:col-span-2 rounded-xl border border-card-border bg-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Conversión diaria</h3>
          {daily.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Sin datos en este período</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-5 gap-2 text-xs text-gray-500 font-medium px-2">
                <span>Fecha</span>
                <span className="text-center">Convs</span>
                <span className="text-center">Pedidos</span>
                <span className="text-center">Pagados</span>
                <span className="text-center">Tasa</span>
              </div>
              {daily.map((d: any) => (
                <div key={d.date} className="grid grid-cols-5 gap-2 items-center px-2 py-1.5 rounded-lg hover:bg-gray-800/50">
                  <span className="text-sm text-gray-300">
                    {new Date(d.date + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-sm text-center text-blue-300">{d.conversations}</span>
                  <span className="text-sm text-center text-yellow-300">{d.orders}</span>
                  <span className="text-sm text-center text-green-300">{d.paid}</span>
                  <div className="flex items-center justify-center gap-1">
                    <div className="w-12 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${Math.min(d.convRate, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400">{d.convRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Channel Breakdown */}
        <div className="rounded-xl border border-card-border bg-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Por canal</h3>
          {channels.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Sin datos</p>
          ) : (
            <div className="space-y-4">
              {channels.map((ch: any) => (
                <div key={ch.channel} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white capitalize">{channelIcon(ch.channel)} {ch.channel}</span>
                    <span className="text-sm text-accent font-medium">{ch.convRate}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{ch.conversations} convs</span>
                    <span>→</span>
                    <span>{ch.orders} pedidos</span>
                  </div>
                  <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${Math.min(ch.convRate, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FunnelCard({ label, value, icon, rate, rateLabel, subtitle }: {
  label: string;
  value: string | number;
  icon: string;
  rate?: number;
  rateLabel?: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xl">{icon}</span>
        {rate !== undefined && (
          <span className="text-xs font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full">
            {rate}% {rateLabel}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    </div>
  );
}

function FunnelBar({ label, value, max, color }: {
  label: string; value: number; max: number; color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        <span className="text-sm font-bold text-white">{value}</span>
      </div>
      <div className="w-full h-6 bg-gray-700 rounded-lg overflow-hidden">
        <div
          className={`h-full ${color} rounded-lg transition-all duration-500`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}

function channelIcon(channel: string): string {
  const icons: Record<string, string> = {
    whatsapp: '📱',
    instagram: '📸',
    facebook: '👤',
    web: '🌐',
    sms: '💬',
  };
  return icons[channel] ?? '📨';
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${Math.round(seconds / 3600)}h`;
}
