'use client';

import { useApi } from '@/hooks/use-api';

interface Props {
  period: string;
}

export function FinancialDashboard({ period }: Props) {
  const { data, loading } = useApi<any>(`/reports/financial?period=${period}`);

  if (loading) return <LoadingSkeleton />;
  if (!data) return <p className="text-gray-400">No hay datos disponibles</p>;

  const { income, payments, accounting, trends } = data;

  return (
    <div className="space-y-6">
      {/* Income Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard label="Ingresos brutos" value={`$${income.grossRevenue.toLocaleString()}`} color="text-green-400" />
        <MetricCard label="Ingresos netos" value={`$${income.netRevenue.toLocaleString()}`} color="text-emerald-400" />
        <MetricCard label="IVA recaudado" value={`$${income.taxCollected.toLocaleString()}`} color="text-blue-400" />
        <MetricCard label="Envíos" value={`$${income.shippingRevenue.toLocaleString()}`} color="text-cyan-400" />
        <MetricCard label="Reembolsos" value={`-$${income.refunds.toLocaleString()}`} color="text-red-400" />
      </div>

      {/* Payments Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Pagos</h3>
          <div className="space-y-3">
            <PaymentRow label="Total" value={payments.total} color="text-white" />
            <PaymentRow label="Verificados" value={payments.verified} color="text-green-400" />
            <PaymentRow label="Pendientes" value={payments.pending} color="text-yellow-400" />
            <PaymentRow label="Rechazados" value={payments.rejected} color="text-red-400" />
          </div>
          {payments.byMethod && Object.keys(payments.byMethod).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-700">
              <p className="text-xs text-gray-500 mb-2">Por método:</p>
              {Object.entries(payments.byMethod).map(([method, data]: [string, any]) => (
                <div key={method} className="flex justify-between text-sm py-1">
                  <span className="text-gray-400 capitalize">{method}</span>
                  <span className="text-white">{data.count} — ${data.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Accounting Summary */}
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Contabilidad</h3>
          <div className="space-y-3">
            <PaymentRow label="Entradas totales" value={accounting.totalEntries} color="text-white" />
            <PaymentRow label="Ventas" value={`$${accounting.sales.toLocaleString()}`} color="text-green-400" />
            <PaymentRow label="Envíos" value={`$${accounting.shipping.toLocaleString()}`} color="text-cyan-400" />
            <PaymentRow label="Reembolsos" value={`-$${accounting.refunds.toLocaleString()}`} color="text-red-400" />
            <PaymentRow label="Ajustes" value={`$${accounting.adjustments.toLocaleString()}`} color="text-yellow-400" />
          </div>
        </div>
      </div>

      {/* Daily Revenue Trend */}
      {trends?.dailyRevenue?.length > 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Tendencia de ingresos diarios</h3>
          <div className="flex items-end gap-1 h-32">
            {trends.dailyRevenue.map((day: any, i: number) => {
              const max = Math.max(...trends.dailyRevenue.map((d: any) => d.amount));
              const height = max > 0 ? (day.amount / max) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-purple-500/60 rounded-t hover:bg-purple-400/80 transition-colors"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${day.date}: $${day.amount.toLocaleString()}`}
                  />
                  {i % 5 === 0 && (
                    <span className="text-[9px] text-gray-500">{day.date?.slice(5)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function PaymentRow({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-400">{label}</span>
      <span className={`text-sm font-medium ${color}`}>{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-gray-800" />)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-48 rounded-xl bg-gray-800" />
        <div className="h-48 rounded-xl bg-gray-800" />
      </div>
    </div>
  );
}
