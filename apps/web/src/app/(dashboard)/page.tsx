'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/lib/auth-context';
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
  new: 'Nuevo',
  payment_pending: 'Pago pendiente',
  payment_verified: 'Pagado',
  in_production: 'En producción',
  ready: 'Listo',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

type Period = 'today' | 'week' | 'month';

export default function DashboardPage() {
  const { tenant } = useAuth();
  const industry = tenant?.industry ?? null;

  if (industry === 'inmobiliaria') {
    return <InmobiliariaDashboard />;
  }

  return <DefaultDashboard />;
}

// ─── Inmobiliaria Dashboard ──────────────────────────────────────

function InmobiliariaDashboard() {
  const { data: reservations, loading } = useApi<any[]>('/reservations');

  if (loading) {
    return (
      <div className="space-y-6 p-1">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const now = new Date();
  const all = reservations ?? [];
  const active = all.filter((r) => r.status !== 'cancelled');

  // This month
  const thisMonth = active.filter((r) => {
    const ci = new Date(r.checkIn);
    return ci.getFullYear() === now.getFullYear() && ci.getMonth() === now.getMonth();
  });
  const monthRevenue = thisMonth.reduce((sum, r) => sum + (parseFloat(r.totalPrice) || 0), 0);
  const monthNights = thisMonth.reduce((sum, r) => sum + (r.nights ?? 0), 0);

  // Occupancy this month
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const bookedDays = new Set<number>();
  active.forEach((r) => {
    const ci = new Date(r.checkIn);
    const co = new Date(r.checkOut);
    for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        bookedDays.add(d.getDate());
      }
    }
  });
  const occupancy = Math.round((bookedDays.size / daysInMonth) * 100);

  // Today's check-ins and check-outs
  const todayStr = now.toISOString().split('T')[0];
  const todayCheckIns = active.filter((r) => (r.checkIn ?? '').split('T')[0] === todayStr);
  const todayCheckOuts = active.filter((r) => (r.checkOut ?? '').split('T')[0] === todayStr);

  // Upcoming (next 7 days)
  const next7 = new Date(now.getTime() + 7 * 86400000);
  const upcoming = active
    .filter((r) => {
      const ci = new Date(r.checkIn);
      return ci >= now && ci <= next7 && r.status === 'confirmed';
    })
    .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());

  // Pending confirmations
  const pendingConfirm = all.filter((r) => r.status === 'pending');

  // Total revenue all time
  const totalRevenue = active.reduce((sum, r) => sum + (parseFloat(r.totalPrice) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-gray-400">Resumen de tu hospedaje</p>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="vspro-stat-card border-blue-500/30">
          <span className="text-2xl">📊</span>
          <p className="mt-3 text-2xl font-bold text-blue-400">{occupancy}%</p>
          <p className="text-sm text-gray-400">Ocupación este mes</p>
          <div className="mt-2 w-full bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${occupancy}%` }}
            />
          </div>
        </div>
        <div className="vspro-stat-card border-green-500/30">
          <span className="text-2xl">💰</span>
          <p className="mt-3 text-2xl font-bold text-green-400">
            ${monthRevenue.toLocaleString('es-MX')}
          </p>
          <p className="text-sm text-gray-400">Ingresos este mes</p>
          <p className="text-xs text-gray-500 mt-1">{monthNights} noches vendidas</p>
        </div>
        <div className="vspro-stat-card">
          <span className="text-2xl">🟢</span>
          <p className="mt-3 text-2xl font-bold text-white">{todayCheckIns.length}</p>
          <p className="text-sm text-gray-400">Check-ins hoy</p>
          {todayCheckIns.length > 0 && (
            <p className="text-xs text-green-400 mt-1">
              {todayCheckIns.map((r) => r.guestName).join(', ')}
            </p>
          )}
        </div>
        <div className="vspro-stat-card">
          <span className="text-2xl">🔴</span>
          <p className="mt-3 text-2xl font-bold text-white">{todayCheckOuts.length}</p>
          <p className="text-sm text-gray-400">Check-outs hoy</p>
          {todayCheckOuts.length > 0 && (
            <p className="text-xs text-red-300 mt-1">
              {todayCheckOuts.map((r) => r.guestName).join(', ')}
            </p>
          )}
        </div>
      </div>

      {/* Pending + Upcoming */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pending confirmations */}
        <div className="rounded-xl border border-card-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-300">⏳ Pendientes de confirmar</h3>
            <span className="rounded-full bg-yellow-900/40 px-2 py-0.5 text-xs text-yellow-300">
              {pendingConfirm.length}
            </span>
          </div>
          {pendingConfirm.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Sin reservas pendientes</p>
          ) : (
            <div className="space-y-2">
              {pendingConfirm.slice(0, 5).map((r) => (
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
                      })}
                    </p>
                  </div>
                  <span className="text-sm text-green-400">
                    ${parseFloat(r.totalPrice).toLocaleString('es-MX')}
                  </span>
                </div>
              ))}
            </div>
          )}
          {pendingConfirm.length > 0 && (
            <a
              href="/reservations"
              className="block text-center text-xs text-accent mt-3 hover:underline"
            >
              Ver todas →
            </a>
          )}
        </div>

        {/* Upcoming check-ins */}
        <div className="rounded-xl border border-card-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-300">📅 Próximos 7 días</h3>
            <a href="/calendar" className="text-xs text-accent hover:underline">
              Calendario →
            </a>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Sin check-ins próximos</p>
          ) : (
            <div className="space-y-2">
              {upcoming.slice(0, 6).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0"
                >
                  <div>
                    <p className="text-sm text-white">{r.guestName}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(r.checkIn).toLocaleDateString('es-MX', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      · {r.nights} noches · {r.guests ?? 1} huéspedes
                    </p>
                  </div>
                  <span className="text-sm text-green-400">
                    ${parseFloat(r.totalPrice).toLocaleString('es-MX')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-700 bg-card/50 p-3">
          <p className="text-lg font-bold text-white">{active.length}</p>
          <p className="text-xs text-gray-400">Reservas totales</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-card/50 p-3">
          <p className="text-lg font-bold text-purple-300">
            ${totalRevenue.toLocaleString('es-MX')}
          </p>
          <p className="text-xs text-gray-400">Revenue total</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-card/50 p-3">
          <p className="text-lg font-bold text-blue-300">
            {
              active.filter(
                (r) => r.stays > 1 || all.filter((x) => x.guestName === r.guestName).length > 1,
              ).length
            }
          </p>
          <p className="text-xs text-gray-400">Huéspedes repetidores</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-card/50 p-3">
          <p className="text-lg font-bold text-green-300">
            {active.reduce((sum, r) => sum + (r.nights ?? 0), 0)}
          </p>
          <p className="text-xs text-gray-400">Noches vendidas total</p>
        </div>
      </div>
    </div>
  );
}

// ─── Default Dashboard (restaurants, shops, etc.) ────────────────

function DefaultDashboard() {
  const [period, setPeriod] = useState<Period>('today');
  const { data, loading } = useApi<any>('/dashboard/stats');
  const { data: reportData } = useApi<any>(`/reports/summary`);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const stats = data?.stats ?? {
    ordersToday: 0,
    inProduction: 0,
    readyForShipment: 0,
    salesToday: 0,
  };
  const recentOrders = data?.recentOrders ?? [];
  const report = reportData ?? {};
  const revenue = report.revenue?.total ?? report.revenue ?? 0;
  const orderCount = report.orders?.total ?? report.orders ?? 0;
  const avgTicket = orderCount > 0 ? (typeof revenue === 'number' ? revenue : 0) / orderCount : 0;
  const collected = report.revenue?.paid ?? report.collected ?? 0;
  const pending = report.revenue?.pending ?? report.pending ?? 0;
  const newCustomers = report.customers?.newInPeriod ?? report.newCustomers ?? 0;
  const topProducts = report.topProducts ?? [];

  const periodLabels: Record<Period, string> = {
    today: 'Hoy',
    week: 'Esta semana',
    month: 'Este mes',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-400">Resumen de tu negocio</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-800 p-1">
          {(['today', 'week', 'month'] as Period[]).map((p) => (
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
        <MiniStat
          label="Ventas hoy"
          value={`$${Number(stats.salesToday).toLocaleString()}`}
          color="green"
        />
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
                    <p className="text-xs text-gray-500">
                      ${Number(p.revenue ?? 0).toLocaleString()}
                    </p>
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
            <a href="/orders" className="text-xs text-accent hover:underline">
              Ver todos →
            </a>
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[order.status] ?? ''}`}
                    >
                      {statusLabels[order.status] ?? order.status}
                    </span>
                    <div>
                      <p className="text-sm text-white font-medium">{order.orderNumber}</p>
                      <p className="text-xs text-gray-400">{order.customerName}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white font-medium">
                      ${Number(order.total).toLocaleString('es-MX')}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString('es-MX', {
                        day: 'numeric',
                        month: 'short',
                      })}
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

function StatCard({
  icon,
  label,
  value,
  subtitle,
  accent,
}: {
  icon: string;
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: boolean;
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

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
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
