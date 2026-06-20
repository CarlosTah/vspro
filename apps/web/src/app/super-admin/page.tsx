'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { VsproLogo } from '@/components/vspro-logo';

type Tab = 'overview' | 'revenue' | 'tenants';

export default function SuperAdminPage() {
  const [stats, setStats] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    Promise.all([
      api.get('/super-admin/stats'),
      api.get('/super-admin/tenants'),
    ])
      .then(([s, t]) => { setStats(s); setTenants(t); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSuspend = async (tenantId: string) => {
    if (!confirm('¿Suspender este tenant?')) return;
    await api.post(`/super-admin/tenants/${tenantId}/suspend`);
    setTenants(tenants.map((t) => t.id === tenantId ? { ...t, status: 'SUSPENDED' } : t));
  };

  const handleReactivate = async (tenantId: string) => {
    await api.post(`/super-admin/tenants/${tenantId}/reactivate`);
    setTenants(tenants.map((t) => t.id === tenantId ? { ...t, status: 'ACTIVE' } : t));
  };

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">Cargando...</div>;

  // Calculate revenue metrics
  const activeTenants = tenants.filter(t => t.status === 'ACTIVE');
  const trialTenants = tenants.filter(t => t.status === 'TRIAL');
  const suspendedTenants = tenants.filter(t => t.status === 'SUSPENDED');

  const planPrices: Record<string, number> = { 'basic': 990, 'pro': 1490, 'enterprise': 2499 };
  const mrr = activeTenants.reduce((sum, t) => sum + (planPrices[t.plan?.slug] ?? 0), 0);

  const subscribersByPlan = {
    basic: activeTenants.filter(t => t.plan?.slug === 'basic').length,
    pro: activeTenants.filter(t => t.plan?.slug === 'pro').length,
    enterprise: activeTenants.filter(t => t.plan?.slug === 'enterprise').length,
  };

  const filteredTenants = filter === 'all' ? tenants
    : filter === 'active' ? activeTenants
    : filter === 'trial' ? trialTenants
    : filter === 'suspended' ? suspendedTenants
    : tenants;

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-900/40 text-green-300',
    TRIAL: 'bg-blue-900/40 text-blue-300',
    SUSPENDED: 'bg-red-900/40 text-red-300',
    CANCELLED: 'bg-gray-700 text-gray-400',
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <VsproLogo size="sm" showSlogan={false} className="items-start" />
            <p className="text-gray-400 mt-1 text-sm">Panel de administración de la plataforma</p>
          </div>
          <span className="rounded-full bg-purple-900/50 border border-purple-700 px-3 py-1 text-xs font-medium text-purple-300">
            Super Admin
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-gray-800 p-1 w-fit">
          {([
            { key: 'overview', label: '📊 Resumen' },
            { key: 'revenue', label: '💰 Revenue' },
            { key: 'tenants', label: '🏢 Tenants' },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-accent text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {tab === 'overview' && stats && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="MRR" value={`$${mrr.toLocaleString('es-MX')}`} sub="MXN/mes" color="text-green-400" />
            <StatCard label="Tenants activos" value={activeTenants.length} sub="pagando" color="text-blue-400" />
            <StatCard label="En trial" value={trialTenants.length} sub="7 días gratis" color="text-yellow-400" />
            <StatCard label="Total tenants" value={tenants.length} sub="registrados" color="text-purple-400" />
          </div>
        )}

        {/* Revenue Tab */}
        {tab === 'revenue' && (
          <div className="space-y-6">
            {/* MRR Card */}
            <div className="rounded-xl border border-green-800/50 bg-green-900/20 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-400 font-medium">Monthly Recurring Revenue (MRR)</p>
                  <p className="text-4xl font-bold text-white mt-1">${mrr.toLocaleString('es-MX')} <span className="text-lg text-gray-400">MXN</span></p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400">ARR proyectado</p>
                  <p className="text-xl font-bold text-green-400">${(mrr * 12).toLocaleString('es-MX')}</p>
                </div>
              </div>
            </div>

            {/* Subscribers by plan */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <PlanCard
                name="Básico"
                price="$990"
                subscribers={subscribersByPlan.basic}
                revenue={subscribersByPlan.basic * 990}
                color="border-gray-600"
              />
              <PlanCard
                name="Profesional"
                price="$1,490"
                subscribers={subscribersByPlan.pro}
                revenue={subscribersByPlan.pro * 1490}
                color="border-purple-600"
                popular
              />
              <PlanCard
                name="Avanzado"
                price="$2,499"
                subscribers={subscribersByPlan.enterprise}
                revenue={subscribersByPlan.enterprise * 2499}
                color="border-green-600"
              />
            </div>

            {/* Subscription table */}
            <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
                <h3 className="font-semibold text-white">Suscripciones</h3>
                <div className="flex gap-2">
                  {['all', 'active', 'trial', 'suspended'].map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        filter === f ? 'bg-accent text-white' : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : f === 'trial' ? 'Trial' : 'Vencidos'}
                    </button>
                  ))}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Negocio</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Plan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Monto</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Estado</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Desde</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {filteredTenants.map(t => (
                    <tr key={t.id} className="hover:bg-gray-750">
                      <td className="px-6 py-3">
                        <p className="text-white font-medium">{t.businessName}</p>
                        <p className="text-xs text-gray-500">{t.ownerEmail}</p>
                      </td>
                      <td className="px-6 py-3 text-gray-300">{t.plan?.name ?? '—'}</td>
                      <td className="px-6 py-3 text-white font-medium">
                        ${(planPrices[t.plan?.slug] ?? 0).toLocaleString('es-MX')}
                        <span className="text-xs text-gray-500">/mes</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[t.status] ?? ''}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-xs">
                        {new Date(t.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-3">
                        {t.status === 'ACTIVE' || t.status === 'TRIAL' ? (
                          <button onClick={() => handleSuspend(t.id)} className="text-xs text-red-400 hover:text-red-300">
                            Suspender
                          </button>
                        ) : t.status === 'SUSPENDED' ? (
                          <button onClick={() => handleReactivate(t.id)} className="text-xs text-green-400 hover:text-green-300">
                            Reactivar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTenants.length === 0 && (
                <p className="text-center text-gray-500 py-8">Sin resultados para este filtro</p>
              )}
            </div>
          </div>
        )}

        {/* Tenants Tab (simplified list) */}
        {tab === 'tenants' && (
          <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700">
              <h2 className="font-semibold text-white">Todos los tenants ({tenants.length})</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Negocio</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Slug</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Trial hasta</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {tenants.map(t => (
                  <tr key={t.id} className="hover:bg-gray-750">
                    <td className="px-6 py-3">
                      <p className="text-white font-medium">{t.businessName}</p>
                      <p className="text-xs text-gray-500">{t.ownerEmail}</p>
                    </td>
                    <td className="px-6 py-3 text-gray-400 font-mono text-xs">{t.slug}</td>
                    <td className="px-6 py-3 text-gray-300">{t.plan?.name ?? '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[t.status] ?? ''}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-400 text-xs">
                      {t.trialEndsAt ? new Date(t.trialEndsAt).toLocaleDateString('es-MX') : '—'}
                    </td>
                    <td className="px-6 py-3 space-x-2">
                      {t.status === 'ACTIVE' || t.status === 'TRIAL' ? (
                        <button onClick={() => handleSuspend(t.id)} className="text-xs text-red-400 hover:text-red-300">Suspender</button>
                      ) : t.status === 'SUSPENDED' ? (
                        <button onClick={() => handleReactivate(t.id)} className="text-xs text-green-400 hover:text-green-300">Reactivar</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-sm text-gray-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function PlanCard({ name, price, subscribers, revenue, color, popular }: {
  name: string; price: string; subscribers: number; revenue: number; color: string; popular?: boolean;
}) {
  return (
    <div className={`rounded-xl border ${color} bg-gray-800 p-5 ${popular ? 'ring-1 ring-purple-500/50' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-white font-semibold">{name}</h4>
        {popular && <span className="text-xs bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full">Popular</span>}
      </div>
      <p className="text-gray-400 text-sm">{price}/mes</p>
      <div className="mt-4 pt-3 border-t border-gray-700 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xl font-bold text-white">{subscribers}</p>
          <p className="text-xs text-gray-500">suscriptores</p>
        </div>
        <div>
          <p className="text-xl font-bold text-green-400">${revenue.toLocaleString('es-MX')}</p>
          <p className="text-xs text-gray-500">revenue/mes</p>
        </div>
      </div>
    </div>
  );
}
