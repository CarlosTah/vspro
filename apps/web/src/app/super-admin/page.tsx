'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { VsproLogo } from '@/components/vspro-logo';

type Tab = 'overview' | 'revenue' | 'tenants' | 'plans' | 'analytics' | 'broadcast';

const INDUSTRIES = [
  { value: 'restaurante', label: 'Restaurante' },
  { value: 'barberia', label: 'Barbería' },
  { value: 'ropa', label: 'Ropa' },
  { value: 'taller', label: 'Taller' },
  { value: 'clinica', label: 'Clínica' },
  { value: 'inmobiliaria', label: 'Inmobiliaria' },
  { value: 'ecommerce', label: 'E-commerce' },
];

export default function SuperAdminPage() {
  const [stats, setStats] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [filter, setFilter] = useState('all');

  // Create tenant modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newTenant, setNewTenant] = useState({
    slug: '', businessName: '', email: '', ownerName: '', password: '',
    industry: 'restaurante', planSlug: 'basic', trialDays: 7, skipPayment: false,
  });

  // Plans state
  const [plans, setPlans] = useState<any[]>([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [planForm, setPlanForm] = useState({
    name: '', slug: '', priceMonthly: 0, priceYearly: 0,
    features: { maxOrders: 500, maxProducts: 100, maxChannels: 1, maxAgents: 1, aiEnabled: true, reportsEnabled: false, apiAccess: false },
  });
  const [planSaving, setPlanSaving] = useState(false);
  const [planError, setPlanError] = useState('');

  // Analytics state
  const [analytics, setAnalytics] = useState<any>(null);

  // Broadcast state
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastFilter, setBroadcastFilter] = useState<'all' | 'active' | 'trial' | 'suspended'>('all');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.get('/super-admin/stats'),
      api.get('/super-admin/tenants'),
      api.get('/super-admin/plans'),
      api.get('/super-admin/analytics'),
      api.get('/super-admin/broadcasts'),
    ])
      .then(([s, t, p, a, b]) => { setStats(s); setTenants(t); setPlans(p); setAnalytics(a); setBroadcasts(b); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleSuspend = async (tenantId: string) => {
    if (!confirm('¿Suspender este tenant?')) return;
    await api.post(`/super-admin/tenants/${tenantId}/suspend`);
    setTenants(tenants.map((t) => t.id === tenantId ? { ...t, status: 'SUSPENDED' } : t));
  };

  const handleReactivate = async (tenantId: string) => {
    await api.post(`/super-admin/tenants/${tenantId}/reactivate`);
    setTenants(tenants.map((t) => t.id === tenantId ? { ...t, status: 'ACTIVE' } : t));
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      await api.post('/super-admin/tenants', newTenant);
      setShowCreate(false);
      setNewTenant({ slug: '', businessName: '', email: '', ownerName: '', password: '', industry: 'restaurante', planSlug: 'basic', trialDays: 7, skipPayment: false });
      loadData();
    } catch (err: any) {
      setCreateError(err.message || 'Error al crear tenant');
    } finally {
      setCreating(false);
    }
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 50);
  };

  const openCreatePlan = () => {
    setEditingPlan(null);
    setPlanForm({ name: '', slug: '', priceMonthly: 0, priceYearly: 0, features: { maxOrders: 500, maxProducts: 100, maxChannels: 1, maxAgents: 1, aiEnabled: true, reportsEnabled: false, apiAccess: false } });
    setPlanError('');
    setShowPlanModal(true);
  };

  const openEditPlan = (plan: any) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      slug: plan.slug,
      priceMonthly: parseFloat(plan.priceMonthly),
      priceYearly: parseFloat(plan.priceYearly),
      features: plan.features ?? {},
    });
    setPlanError('');
    setShowPlanModal(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanSaving(true);
    setPlanError('');
    try {
      if (editingPlan) {
        await api.patch(`/super-admin/plans/${editingPlan.id}`, {
          name: planForm.name,
          priceMonthly: planForm.priceMonthly,
          priceYearly: planForm.priceYearly,
          features: planForm.features,
        });
      } else {
        await api.post('/super-admin/plans', planForm);
      }
      setShowPlanModal(false);
      loadData();
    } catch (err: any) {
      setPlanError(err.message || 'Error al guardar plan');
    } finally {
      setPlanSaving(false);
    }
  };

  const handleTogglePlan = async (planId: string) => {
    await api.patch(`/super-admin/plans/${planId}/toggle`);
    setPlans(plans.map(p => p.id === planId ? { ...p, isActive: !p.isActive } : p));
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMsg.trim()) return;
    if (!confirm(`¿Enviar mensaje a ${broadcastFilter === 'all' ? 'TODOS' : broadcastFilter} los tenants?`)) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const res = await api.post('/super-admin/broadcast', { message: broadcastMsg, filter: broadcastFilter });
      setBroadcastResult(res);
      setBroadcastMsg('');
      const b = await api.get('/super-admin/broadcasts');
      setBroadcasts(b);
    } catch (err: any) {
      setBroadcastResult({ success: false, error: err.message });
    } finally {
      setBroadcasting(false);
    }
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
            { key: 'plans', label: '📋 Planes' },
            { key: 'analytics', label: '📈 Analytics' },
            { key: 'broadcast', label: '📢 Broadcast' },
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

            {/* Monthly Revenue History */}
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4">📈 Revenue mensual</h3>
              <div className="space-y-2">
                {(() => {
                  // Calculate revenue by month of registration
                  const months: Record<string, { tenants: number; revenue: number }> = {};
                  activeTenants.forEach(t => {
                    const month = new Date(t.createdAt).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
                    if (!months[month]) months[month] = { tenants: 0, revenue: 0 };
                    months[month].tenants++;
                    months[month].revenue += planPrices[t.plan?.slug] ?? 0;
                  });
                  const entries = Object.entries(months);
                  if (entries.length === 0) return <p className="text-sm text-gray-500">Sin datos aún</p>;
                  return entries.map(([month, data]) => (
                    <div key={month} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                      <span className="text-sm text-gray-300 capitalize">{month}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-green-400">${data.revenue.toLocaleString('es-MX')}</span>
                        <span className="text-xs text-gray-500 ml-2">({data.tenants} clientes)</span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between">
                <span className="text-sm text-gray-400">Revenue total recurrente</span>
                <span className="text-lg font-bold text-green-400">${mrr.toLocaleString('es-MX')}/mes</span>
              </div>
            </div>
          </div>
        )}

        {/* Tenants Tab (simplified list) */}
        {tab === 'tenants' && (
          <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-white">Todos los tenants ({tenants.length})</h2>
              <button
                onClick={() => setShowCreate(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                + Nuevo cliente
              </button>
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
                      <a href={`/super-admin/tenants/${t.id}`} className="text-xs text-blue-400 hover:text-blue-300">Ver</a>
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

        {/* Analytics Tab */}
        {tab === 'analytics' && analytics && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
                <p className="text-xs text-gray-400 mb-1">Churn Rate</p>
                <p className={`text-2xl font-bold ${analytics.churnRate > 10 ? 'text-red-400' : analytics.churnRate > 5 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {analytics.churnRate}%
                </p>
                <p className="text-xs text-gray-500 mt-1">mensual</p>
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
                <p className="text-xs text-gray-400 mb-1">Conversión Trial→Paid</p>
                <p className={`text-2xl font-bold ${analytics.conversionRate > 30 ? 'text-green-400' : analytics.conversionRate > 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {analytics.conversionRate}%
                </p>
                <p className="text-xs text-gray-500 mt-1">{analytics.activeTenants}/{analytics.totalTenants}</p>
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
                <p className="text-xs text-gray-400 mb-1">LTV estimado</p>
                <p className="text-2xl font-bold text-blue-400">${analytics.ltv.toLocaleString('es-MX')}</p>
                <p className="text-xs text-gray-500 mt-1">por cliente</p>
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
                <p className="text-xs text-gray-400 mb-1">Crecimiento</p>
                <p className={`text-2xl font-bold ${analytics.growthRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {analytics.growthRate > 0 ? '+' : ''}{analytics.growthRate}%
                </p>
                <p className="text-xs text-gray-500 mt-1">vs mes anterior</p>
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
                <p className="text-xs text-gray-400 mb-1">Nuevos (30 días)</p>
                <p className="text-2xl font-bold text-purple-400">{analytics.newLast30Days}</p>
                <p className="text-xs text-gray-500 mt-1">registros</p>
              </div>
            </div>

            {/* Monthly Signups Chart */}
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
              <h3 className="font-semibold text-white mb-4">Registros mensuales (últimos 6 meses)</h3>
              <div className="flex items-end gap-3 h-32">
                {analytics.monthlySignups?.map((m: any) => {
                  const max = Math.max(...analytics.monthlySignups.map((s: any) => s.count), 1);
                  const height = (m.count / max) * 100;
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-white font-medium">{m.count}</span>
                      <div
                        className="w-full rounded-t-md bg-blue-600 transition-all"
                        style={{ height: `${Math.max(height, 4)}%` }}
                      />
                      <span className="text-[10px] text-gray-500 capitalize">{m.month}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Tenants */}
            <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h3 className="font-semibold text-white">Top 10 tenants más activos (este mes)</h3>
              </div>
              {analytics.topTenants?.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">#</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Negocio</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Plan</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Pedidos</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Mensajes</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">IA Calls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {analytics.topTenants.map((t: any, i: number) => (
                      <tr key={t.slug} className="hover:bg-gray-750">
                        <td className="px-6 py-3 text-gray-500 text-xs">{i + 1}</td>
                        <td className="px-6 py-3">
                          <p className="text-white font-medium">{t.businessName}</p>
                          <p className="text-xs text-gray-500 font-mono">{t.slug}</p>
                        </td>
                        <td className="px-6 py-3 text-gray-300 text-xs">{t.plan}</td>
                        <td className="px-6 py-3 text-white font-medium">{t.orders}</td>
                        <td className="px-6 py-3 text-gray-300">{t.messages}</td>
                        <td className="px-6 py-3 text-gray-300">{t.aiCalls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-center text-gray-500 py-8">Sin datos de uso este mes</p>
              )}
            </div>
          </div>
        )}

        {/* Broadcast Tab */}
        {tab === 'broadcast' && (
          <div className="space-y-6">
            {/* Compose */}
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-6">
              <h3 className="font-semibold text-white mb-4">Enviar mensaje masivo por WhatsApp</h3>
              <form onSubmit={handleSendBroadcast} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Destinatarios</label>
                  <div className="flex gap-2">
                    {(['all', 'active', 'trial', 'suspended'] as const).map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setBroadcastFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          broadcastFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                        }`}
                      >
                        {f === 'all' ? 'Todos' : f === 'active' ? 'Activos' : f === 'trial' ? 'En trial' : 'Suspendidos'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Mensaje</label>
                  <textarea
                    value={broadcastMsg}
                    onChange={(e) => setBroadcastMsg(e.target.value)}
                    rows={4}
                    required
                    placeholder="Escribe tu mensaje aquí... Puedes usar *negritas* y _cursivas_"
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">{broadcastMsg.length} caracteres</p>
                </div>
                <button
                  type="submit"
                  disabled={broadcasting || !broadcastMsg.trim()}
                  className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {broadcasting ? 'Enviando...' : '📢 Enviar broadcast'}
                </button>
              </form>

              {broadcastResult && (
                <div className={`mt-4 rounded-lg px-4 py-3 ${broadcastResult.success ? 'bg-green-900/50 border border-green-700' : 'bg-red-900/50 border border-red-700'}`}>
                  <p className={`text-sm ${broadcastResult.success ? 'text-green-300' : 'text-red-300'}`}>
                    {broadcastResult.success
                      ? `Enviado a ${broadcastResult.sentCount}/${broadcastResult.recipientsCount} tenants (${broadcastResult.failedCount} fallidos)`
                      : `Error: ${broadcastResult.error}`}
                  </p>
                </div>
              )}
            </div>

            {/* History */}
            <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h3 className="font-semibold text-white">Historial de broadcasts</h3>
              </div>
              {broadcasts.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Fecha</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Mensaje</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Filtro</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Enviados</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Fallidos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {broadcasts.map((b: any) => (
                      <tr key={b.id}>
                        <td className="px-6 py-3 text-gray-300 text-xs whitespace-nowrap">
                          {new Date(b.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-3 text-white text-xs max-w-xs truncate">{b.message}</td>
                        <td className="px-6 py-3">
                          <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-300">{b.filter}</span>
                        </td>
                        <td className="px-6 py-3 text-green-400 font-medium">{b.sentCount}/{b.recipientsCount}</td>
                        <td className="px-6 py-3 text-red-400">{b.failedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-center text-gray-500 py-8">Sin broadcasts enviados</p>
              )}
            </div>

            {/* Auto notifications info */}
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
              <h3 className="font-semibold text-white mb-2">Notificaciones automáticas</h3>
              <p className="text-sm text-gray-400 mb-3">Estos mensajes se envían automáticamente sin intervención:</p>
              <ul className="space-y-2 text-sm text-gray-300">
                <li className="flex items-center gap-2"><span className="text-yellow-400">⏰</span> Trial expira en 2 días — recordatorio diario a las 10:00 AM</li>
                <li className="flex items-center gap-2"><span className="text-red-400">🔔</span> Trial expirado hoy — notificación el día que vence</li>
                <li className="flex items-center gap-2"><span className="text-blue-400">💳</span> Cobro próximo — recordatorio el día 28 de cada mes</li>
              </ul>
            </div>
          </div>
        )}

        {/* Plans Tab */}
        {tab === 'plans' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="font-semibold text-white">Planes ({plans.length})</h2>
                <button
                  onClick={openCreatePlan}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  + Nuevo plan
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Nombre</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Slug</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Precio/mes</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Precio/año</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Límites</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Estado</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {plans.map(p => (
                    <tr key={p.id} className="hover:bg-gray-750">
                      <td className="px-6 py-3 text-white font-medium">{p.name}</td>
                      <td className="px-6 py-3 text-gray-400 font-mono text-xs">{p.slug}</td>
                      <td className="px-6 py-3 text-white">${parseFloat(p.priceMonthly).toLocaleString('es-MX')}</td>
                      <td className="px-6 py-3 text-gray-300">${parseFloat(p.priceYearly).toLocaleString('es-MX')}</td>
                      <td className="px-6 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.features?.maxOrders && <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{p.features.maxOrders} pedidos</span>}
                          {p.features?.maxChannels && <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{p.features.maxChannels} canales</span>}
                          {p.features?.apiAccess && <span className="text-xs bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded">API</span>}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <button
                          onClick={() => handleTogglePlan(p.id)}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            p.isActive ? 'bg-green-900/40 text-green-300' : 'bg-red-900/40 text-red-300'
                          }`}
                        >
                          {p.isActive ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="px-6 py-3">
                        <button onClick={() => openEditPlan(p)} className="text-xs text-blue-400 hover:text-blue-300">
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plans.length === 0 && (
                <p className="text-center text-gray-500 py-8">No hay planes configurados</p>
              )}
            </div>
          </div>
        )}

        {/* Plan Create/Edit Modal */}
        {showPlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-gray-800 border border-gray-700 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">{editingPlan ? 'Editar plan' : 'Nuevo plan'}</h2>
                <button onClick={() => setShowPlanModal(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
              </div>

              {planError && (
                <div className="rounded-lg bg-red-900/50 border border-red-700 px-4 py-3 mb-4">
                  <p className="text-sm text-red-300">{planError}</p>
                </div>
              )}

              <form onSubmit={handleSavePlan} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Nombre</label>
                    <input
                      type="text"
                      value={planForm.name}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                      required
                      placeholder="Profesional"
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Slug</label>
                    <input
                      type="text"
                      value={planForm.slug}
                      onChange={(e) => setPlanForm({ ...planForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                      required
                      disabled={!!editingPlan}
                      placeholder="pro"
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Precio mensual (MXN)</label>
                    <input
                      type="number"
                      value={planForm.priceMonthly}
                      onChange={(e) => setPlanForm({ ...planForm, priceMonthly: parseFloat(e.target.value) || 0 })}
                      required
                      min={0}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Precio anual (MXN)</label>
                    <input
                      type="number"
                      value={planForm.priceYearly}
                      onChange={(e) => setPlanForm({ ...planForm, priceYearly: parseFloat(e.target.value) || 0 })}
                      required
                      min={0}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">Límites y features</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Max pedidos/mes</label>
                      <input
                        type="number"
                        value={planForm.features.maxOrders ?? 0}
                        onChange={(e) => setPlanForm({ ...planForm, features: { ...planForm.features, maxOrders: parseInt(e.target.value) || 0 } })}
                        className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Max productos</label>
                      <input
                        type="number"
                        value={planForm.features.maxProducts ?? 0}
                        onChange={(e) => setPlanForm({ ...planForm, features: { ...planForm.features, maxProducts: parseInt(e.target.value) || 0 } })}
                        className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Max canales</label>
                      <input
                        type="number"
                        value={planForm.features.maxChannels ?? 0}
                        onChange={(e) => setPlanForm({ ...planForm, features: { ...planForm.features, maxChannels: parseInt(e.target.value) || 0 } })}
                        className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Max agentes</label>
                      <input
                        type="number"
                        value={planForm.features.maxAgents ?? 0}
                        onChange={(e) => setPlanForm({ ...planForm, features: { ...planForm.features, maxAgents: parseInt(e.target.value) || 0 } })}
                        className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={planForm.features.aiEnabled ?? false}
                        onChange={(e) => setPlanForm({ ...planForm, features: { ...planForm.features, aiEnabled: e.target.checked } })}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-blue-500"
                      />
                      <span className="text-xs text-gray-300">IA habilitada</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={planForm.features.reportsEnabled ?? false}
                        onChange={(e) => setPlanForm({ ...planForm, features: { ...planForm.features, reportsEnabled: e.target.checked } })}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-blue-500"
                      />
                      <span className="text-xs text-gray-300">Reportes avanzados</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={planForm.features.apiAccess ?? false}
                        onChange={(e) => setPlanForm({ ...planForm, features: { ...planForm.features, apiAccess: e.target.checked } })}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-blue-500"
                      />
                      <span className="text-xs text-gray-300">Acceso API</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPlanModal(false)}
                    className="flex-1 rounded-lg border border-gray-600 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={planSaving}
                    className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {planSaving ? 'Guardando...' : editingPlan ? 'Guardar cambios' : 'Crear plan'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Create Tenant Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-gray-800 border border-gray-700 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">Nuevo cliente</h2>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
              </div>

              {createError && (
                <div className="rounded-lg bg-red-900/50 border border-red-700 px-4 py-3 mb-4">
                  <p className="text-sm text-red-300">{createError}</p>
                </div>
              )}

              <form onSubmit={handleCreateTenant} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Nombre del dueño</label>
                    <input
                      type="text"
                      value={newTenant.ownerName}
                      onChange={(e) => setNewTenant({ ...newTenant, ownerName: e.target.value })}
                      required
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={newTenant.email}
                      onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
                      required
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Nombre del negocio</label>
                  <input
                    type="text"
                    value={newTenant.businessName}
                    onChange={(e) => {
                      const name = e.target.value;
                      setNewTenant({ ...newTenant, businessName: name, slug: generateSlug(name) });
                    }}
                    required
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Slug (URL)</label>
                    <input
                      type="text"
                      value={newTenant.slug}
                      onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                      required
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Contraseña</label>
                    <input
                      type="text"
                      value={newTenant.password}
                      onChange={(e) => setNewTenant({ ...newTenant, password: e.target.value })}
                      required
                      minLength={8}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Giro</label>
                    <select
                      value={newTenant.industry}
                      onChange={(e) => setNewTenant({ ...newTenant, industry: e.target.value })}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {INDUSTRIES.map(i => (
                        <option key={i.value} value={i.value}>{i.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Plan</label>
                    <select
                      value={newTenant.planSlug}
                      onChange={(e) => setNewTenant({ ...newTenant, planSlug: e.target.value })}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="basic">Básico ($990/mes)</option>
                      <option value="pro">Profesional ($1,490/mes)</option>
                      <option value="enterprise">Avanzado ($2,499/mes)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Días de trial</label>
                    <input
                      type="number"
                      value={newTenant.trialDays}
                      onChange={(e) => setNewTenant({ ...newTenant, trialDays: parseInt(e.target.value) || 7 })}
                      min={0}
                      max={90}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newTenant.skipPayment}
                        onChange={(e) => setNewTenant({ ...newTenant, skipPayment: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-300">Activar sin pago</span>
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 rounded-lg border border-gray-600 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {creating ? 'Creando...' : 'Crear cliente'}
                  </button>
                </div>
              </form>
            </div>
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
