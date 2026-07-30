'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function FinancesPage() {
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.get('/reservations');
      setReservations(data);
    } catch {}
    setLoading(false);
  };

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Calculate monthly revenue for last 6 months
  const monthlyRevenue = Array.from({ length: 6 }, (_, i) => {
    const m = new Date(currentYear, currentMonth - (5 - i), 1);
    const monthReservations = reservations.filter((r) => {
      if (r.status === 'cancelled') return false;
      const checkIn = new Date(r.checkIn);
      return checkIn.getFullYear() === m.getFullYear() && checkIn.getMonth() === m.getMonth();
    });
    const revenue = monthReservations.reduce((sum, r) => sum + (parseFloat(r.totalPrice) || 0), 0);
    return {
      label:
        `${MONTHS[m.getMonth()]} ${m.getFullYear() !== currentYear ? m.getFullYear() : ''}`.trim(),
      revenue,
      reservations: monthReservations.length,
    };
  });

  const maxRevenue = Math.max(...monthlyRevenue.map((m) => m.revenue), 1);

  // This month stats
  const thisMonth = reservations.filter((r) => {
    if (r.status === 'cancelled') return false;
    const ci = new Date(r.checkIn);
    return ci.getFullYear() === currentYear && ci.getMonth() === currentMonth;
  });
  const thisMonthRevenue = thisMonth.reduce((sum, r) => sum + (parseFloat(r.totalPrice) || 0), 0);
  const thisMonthNights = thisMonth.reduce((sum, r) => sum + (r.nights ?? 0), 0);

  // All time
  const activeReservations = reservations.filter((r) => r.status !== 'cancelled');
  const totalRevenue = activeReservations.reduce(
    (sum, r) => sum + (parseFloat(r.totalPrice) || 0),
    0,
  );
  const avgPerNight =
    activeReservations.length > 0
      ? totalRevenue / activeReservations.reduce((sum, r) => sum + (r.nights ?? 1), 0)
      : 0;

  // Pending payments (confirmed but not completed)
  const pending = reservations.filter((r) => r.status === 'confirmed' || r.status === 'pending');
  const pendingAmount = pending.reduce((sum, r) => sum + (parseFloat(r.totalPrice) || 0), 0);

  if (loading) return <div className="p-6 text-gray-400">Cargando finanzas...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">💰 Finanzas</h1>
        <p className="text-sm text-gray-400">Ingresos y análisis financiero</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <p className="text-xs text-gray-400">Este mes</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            ${thisMonthRevenue.toLocaleString('es-MX')}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {thisMonth.length} reservas · {thisMonthNights} noches
          </p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <p className="text-xs text-gray-400">Revenue total</p>
          <p className="text-2xl font-bold text-white mt-1">
            ${totalRevenue.toLocaleString('es-MX')}
          </p>
          <p className="text-xs text-gray-500 mt-1">{activeReservations.length} reservas totales</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <p className="text-xs text-gray-400">Promedio/noche</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">
            ${Math.round(avgPerNight).toLocaleString('es-MX')}
          </p>
          <p className="text-xs text-gray-500 mt-1">Tarifa efectiva promedio</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <p className="text-xs text-gray-400">Por cobrar</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">
            ${pendingAmount.toLocaleString('es-MX')}
          </p>
          <p className="text-xs text-gray-500 mt-1">{pending.length} reservas pendientes</p>
        </div>
      </div>

      {/* Revenue chart (simple bar chart) */}
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Ingresos mensuales</h2>
        <div className="flex items-end gap-3 h-40">
          {monthlyRevenue.map((m, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-gray-400">
                {m.revenue > 0 ? `$${(m.revenue / 1000).toFixed(0)}k` : ''}
              </span>
              <div
                className="w-full rounded-t bg-gradient-to-t from-blue-600 to-blue-400 transition-all"
                style={{ height: `${Math.max((m.revenue / maxRevenue) * 100, 4)}%` }}
              />
              <span className="text-[10px] text-gray-500">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Últimas reservas</h2>
        <div className="space-y-2">
          {reservations
            .filter((r) => r.status !== 'cancelled')
            .sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime())
            .slice(0, 10)
            .map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0"
              >
                <div>
                  <p className="text-sm text-white">{r.guestName}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(r.checkIn).toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    →{' '}
                    {new Date(r.checkOut).toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    · {r.nights} noches
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-green-400">
                    ${parseFloat(r.totalPrice).toLocaleString('es-MX')}
                  </p>
                  <span
                    className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                      r.status === 'confirmed'
                        ? 'bg-green-900/40 text-green-300'
                        : r.status === 'pending'
                          ? 'bg-yellow-900/40 text-yellow-300'
                          : r.status === 'completed'
                            ? 'bg-blue-900/40 text-blue-300'
                            : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          {reservations.length === 0 && (
            <p className="text-center text-gray-500 py-4">Sin reservas registradas</p>
          )}
        </div>
      </div>
    </div>
  );
}
