'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { VsproLogo } from '@/components/vspro-logo';

export default function SuperAdminPage() {
  const [stats, setStats] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/super-admin/stats'),
      api.get('/super-admin/tenants'),
    ])
      .then(([s, t]) => { setStats(s); setTenants(t); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleImpersonate = async (tenantId: string) => {
    try {
      const result = await api.post(`/super-admin/tenants/${tenantId}/impersonate`);
      // Abrir en nueva pestaña con el token de impersonación
      const url = `http://localhost:3000?impersonate_token=${result.token}&tenant=${result.tenant.slug}`;
      window.open(url, '_blank');
    } catch (err: any) {
      alert(err.message);
    }
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

  if (loading) return <div className="p-8 text-gray-400">Cargando...</div>;

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-50 text-green-700',
    TRIAL: 'bg-blue-50 text-blue-700',
    SUSPENDED: 'bg-red-50 text-red-700',
    CANCELLED: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header with Logo */}
        <div className="flex items-center justify-between">
          <div>
            <VsproLogo size="sm" showSlogan={false} className="items-start" />
            <p className="text-gray-400 mt-2 text-sm">Panel de control de la plataforma</p>
          </div>
          <span className="rounded-full bg-purple-900/50 border border-purple-700 px-3 py-1 text-xs font-medium text-purple-300">
            Super Admin
          </span>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="MRR" value={`$${stats.revenue.mrr.toLocaleString()}`} color="text-green-400" />
            <StatCard label="Tenants activos" value={stats.tenants.active} color="text-blue-400" />
            <StatCard label="En trial" value={stats.tenants.trial} color="text-yellow-400" />
            <StatCard label="Suspendidos" value={stats.tenants.suspended} color="text-red-400" />
            <StatCard label="Pedidos (mes)" value={stats.usage.totalOrders.toLocaleString()} color="text-purple-400" />
            <StatCard label="Mensajes (mes)" value={stats.usage.totalMessages.toLocaleString()} color="text-cyan-400" />
            <StatCard label="Llamadas IA" value={stats.usage.totalAiCalls.toLocaleString()} color="text-orange-400" />
            <StatCard label="OCR procesados" value={stats.usage.totalOcrCalls.toLocaleString()} color="text-pink-400" />
          </div>
        )}

        {/* Tenants */}
        <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">Tenants ({tenants.length})</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-750 border-b border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Negocio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Creado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-gray-750">
                  <td className="px-6 py-3">
                    <p className="font-medium text-white">{t.businessName}</p>
                    <p className="text-xs text-gray-400">{t.slug} · {t.ownerEmail}</p>
                  </td>
                  <td className="px-6 py-3 text-gray-300">{t.plan?.name ?? '—'}</td>
                  <td className="px-6 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[t.status] ?? ''}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-400 text-xs">
                    {new Date(t.createdAt).toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-6 py-3 space-x-2">
                    <button
                      onClick={() => handleImpersonate(t.id)}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Entrar
                    </button>
                    {t.status === 'ACTIVE' || t.status === 'TRIAL' ? (
                      <button
                        onClick={() => handleSuspend(t.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Suspender
                      </button>
                    ) : t.status === 'SUSPENDED' ? (
                      <button
                        onClick={() => handleReactivate(t.id)}
                        className="text-xs text-green-400 hover:text-green-300"
                      >
                        Reactivar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-sm text-gray-400 mt-1">{label}</p>
    </div>
  );
}
