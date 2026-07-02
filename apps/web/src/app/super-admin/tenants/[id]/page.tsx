'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'info' | 'usage' | 'payments' | 'products' | 'conversations'>('info');

  // Action states
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Edit form
  const [editForm, setEditForm] = useState({ businessName: '', ownerEmail: '', ownerName: '' });

  // Trial/grace form
  const [trialDays, setTrialDays] = useState(7);
  const [graceDays, setGraceDays] = useState(3);

  // Payment form
  const [paymentForm, setPaymentForm] = useState({ amount: 0, reference: '', note: '' });

  // Product form
  const [productForm, setProductForm] = useState({ name: '', price: 0, category: '', description: '' });

  // Conversations
  const [conversations, setConversations] = useState<any[]>([]);

  useEffect(() => {
    loadAll();
  }, [tenantId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [t, u, p, pl] = await Promise.all([
        api.get(`/super-admin/tenants/${tenantId}`),
        api.get(`/super-admin/tenants/${tenantId}/usage`),
        api.get(`/super-admin/tenants/${tenantId}/payments`),
        api.get('/super-admin/plans'),
      ]);
      setTenant(t);
      setUsage(u);
      setPayments(p);
      setPlans(pl);
      setEditForm({ businessName: t.businessName, ownerEmail: t.ownerEmail, ownerName: t.ownerName ?? '' });

      // Load conversations
      api.get(`/super-admin/tenants/${tenantId}/conversations`).then((c: any) => setConversations(c.conversations ?? [])).catch(() => {});
    } catch (err: any) {
      setMsg('Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  const flash = (message: string) => {
    setMsg(message);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleUpdateData = async () => {
    setSaving(true);
    try {
      await api.patch(`/super-admin/tenants/${tenantId}`, editForm);
      flash('Datos actualizados');
      loadAll();
    } catch (err: any) { flash('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  const handleExtendTrial = async () => {
    setSaving(true);
    try {
      const res = await api.post(`/super-admin/tenants/${tenantId}/extend-trial`, { days: trialDays });
      flash(`Trial extendido. Nuevo vencimiento: ${new Date(res.trialEndsAt).toLocaleDateString('es-MX')}`);
      loadAll();
    } catch (err: any) { flash('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  const handleGraceDays = async () => {
    setSaving(true);
    try {
      const res = await api.post(`/super-admin/tenants/${tenantId}/add-grace-days`, { days: graceDays });
      flash(`${graceDays} días de gracia agregados`);
      loadAll();
    } catch (err: any) { flash('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  const handleChangePlan = async (planSlug: string) => {
    setSaving(true);
    try {
      await api.post(`/super-admin/tenants/${tenantId}/change-plan`, { planSlug });
      flash(`Plan cambiado a ${planSlug}`);
      loadAll();
    } catch (err: any) { flash('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  const handleManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/super-admin/tenants/${tenantId}/manual-payment`, paymentForm);
      flash(`Pago de $${paymentForm.amount} registrado`);
      setPaymentForm({ amount: 0, reference: '', note: '' });
      loadAll();
    } catch (err: any) { flash('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  const handleSuspend = async () => {
    if (!confirm('¿Suspender este tenant?')) return;
    await api.post(`/super-admin/tenants/${tenantId}/suspend`);
    flash('Tenant suspendido');
    loadAll();
  };

  const handleReactivate = async () => {
    await api.post(`/super-admin/tenants/${tenantId}/reactivate`);
    flash('Tenant reactivado');
    loadAll();
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/super-admin/tenants/${tenantId}/add-product`, productForm);
      flash(`Producto "${productForm.name}" agregado`);
      setProductForm({ name: '', price: 0, category: '', description: '' });
      loadAll();
    } catch (err: any) { flash('Error: ' + err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">Cargando...</div>;
  if (!tenant) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-red-400">Tenant no encontrado</div>;

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-900/40 text-green-300 border-green-700',
    TRIAL: 'bg-blue-900/40 text-blue-300 border-blue-700',
    SUSPENDED: 'bg-red-900/40 text-red-300 border-red-700',
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => router.push('/super-admin')} className="text-sm text-blue-400 hover:text-blue-300 mb-2 inline-block">
              ← Volver a Super Admin
            </button>
            <h1 className="text-2xl font-bold text-white">{tenant.businessName}</h1>
            <p className="text-sm text-gray-400">{tenant.ownerEmail} · <span className="font-mono">{tenant.slug}</span></p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusColors[tenant.status] ?? 'bg-gray-700 text-gray-400'}`}>
              {tenant.status}
            </span>
            {tenant.status === 'ACTIVE' || tenant.status === 'TRIAL' ? (
              <button onClick={handleSuspend} className="rounded-lg border border-red-700 px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/30">
                Suspender
              </button>
            ) : (
              <button onClick={handleReactivate} className="rounded-lg border border-green-700 px-3 py-1.5 text-xs text-green-400 hover:bg-green-900/30">
                Reactivar
              </button>
            )}
          </div>
        </div>

        {/* Flash message */}
        {msg && (
          <div className="rounded-lg bg-blue-900/50 border border-blue-700 px-4 py-3">
            <p className="text-sm text-blue-300">{msg}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-gray-800 p-1 w-fit">
          {([
            { key: 'info', label: 'Datos & Plan' },
            { key: 'usage', label: 'Uso' },
            { key: 'payments', label: 'Pagos' },
            { key: 'products', label: 'Productos' },
            { key: 'conversations', label: 'Conversaciones' },
          ] as { key: typeof tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Info & Plan Tab */}
        {tab === 'info' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Edit Data */}
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-5 space-y-4">
              <h3 className="font-semibold text-white">Datos del negocio</h3>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nombre del negocio</label>
                <input
                  type="text"
                  value={editForm.businessName}
                  onChange={(e) => setEditForm({ ...editForm, businessName: e.target.value })}
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email dueño</label>
                <input
                  type="email"
                  value={editForm.ownerEmail}
                  onChange={(e) => setEditForm({ ...editForm, ownerEmail: e.target.value })}
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nombre dueño</label>
                <input
                  type="text"
                  value={editForm.ownerName}
                  onChange={(e) => setEditForm({ ...editForm, ownerName: e.target.value })}
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button onClick={handleUpdateData} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                Guardar cambios
              </button>

              <div className="pt-3 border-t border-gray-700">
                <p className="text-xs text-gray-500">Schema: <span className="font-mono">{tenant.schemaName}</span></p>
                <p className="text-xs text-gray-500">Creado: {new Date(tenant.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <p className="text-xs text-gray-500">Trial hasta: {tenant.trialEndsAt ? new Date(tenant.trialEndsAt).toLocaleDateString('es-MX') : '—'}</p>
              </div>
            </div>

            {/* Plan & Trial */}
            <div className="space-y-4">
              {/* Change Plan */}
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-5 space-y-3">
                <h3 className="font-semibold text-white">Plan actual: <span className="text-blue-400">{tenant.plan?.name ?? '—'}</span></h3>
                <div className="flex flex-wrap gap-2">
                  {plans.filter(p => p.isActive).map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleChangePlan(p.slug)}
                      disabled={p.id === tenant.planId}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        p.id === tenant.planId
                          ? 'border-blue-500 bg-blue-900/30 text-blue-300'
                          : 'border-gray-600 text-gray-300 hover:border-blue-500 hover:text-white'
                      }`}
                    >
                      {p.name} · ${parseFloat(p.priceMonthly).toLocaleString('es-MX')}/mes
                    </button>
                  ))}
                </div>
              </div>

              {/* Extend Trial */}
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-5 space-y-3">
                <h3 className="font-semibold text-white">Extender trial</h3>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">Días</label>
                    <input
                      type="number"
                      value={trialDays}
                      onChange={(e) => setTrialDays(parseInt(e.target.value) || 0)}
                      min={1}
                      max={90}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button onClick={handleExtendTrial} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                    Extender
                  </button>
                </div>
              </div>

              {/* Grace Days */}
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-5 space-y-3">
                <h3 className="font-semibold text-white">Días de gracia</h3>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">Días</label>
                    <input
                      type="number"
                      value={graceDays}
                      onChange={(e) => setGraceDays(parseInt(e.target.value) || 0)}
                      min={1}
                      max={30}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button onClick={handleGraceDays} disabled={saving} className="rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50">
                    Agregar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Usage Tab */}
        {tab === 'usage' && usage && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <UsageCard label="Pedidos totales" value={usage.totalOrders} />
            <UsageCard label="Pedidos este mes" value={usage.ordersThisMonth} />
            <UsageCard label="Revenue este mes" value={`$${usage.revenueThisMonth.toLocaleString('es-MX')}`} />
            <UsageCard label="Productos activos" value={usage.totalProducts} />
            <UsageCard label="Clientes" value={usage.totalCustomers} />
            <UsageCard label="Mensajes totales" value={usage.totalMessages} />
          </div>
        )}

        {/* Payments Tab */}
        {tab === 'payments' && (
          <div className="space-y-6">
            {/* Manual Payment Form */}
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
              <h3 className="font-semibold text-white mb-4">Registrar pago manual</h3>
              <form onSubmit={handleManualPayment} className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Monto (MXN)</label>
                  <input
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                    required
                    min={1}
                    className="w-32 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Referencia</label>
                  <input
                    type="text"
                    value={paymentForm.reference}
                    onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                    placeholder="Transferencia #123"
                    className="w-48 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Nota</label>
                  <input
                    type="text"
                    value={paymentForm.note}
                    onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
                    placeholder="Pago mensual"
                    className="w-48 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button type="submit" disabled={saving} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                  Registrar pago
                </button>
              </form>
            </div>

            {/* Payment History */}
            <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h3 className="font-semibold text-white">Historial de pagos</h3>
              </div>
              {payments.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Fecha</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Monto</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Tipo</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Referencia</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400">Nota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {payments.map((p: any) => (
                      <tr key={p.id}>
                        <td className="px-6 py-3 text-gray-300 text-xs">{new Date(p.createdAt).toLocaleDateString('es-MX')}</td>
                        <td className="px-6 py-3 text-white font-medium">${parseFloat(p.amount).toLocaleString('es-MX')}</td>
                        <td className="px-6 py-3"><span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-300">{p.type}</span></td>
                        <td className="px-6 py-3 text-gray-400 text-xs">{p.reference || '—'}</td>
                        <td className="px-6 py-3 text-gray-400 text-xs">{p.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-center text-gray-500 py-8">Sin pagos registrados</p>
              )}
            </div>
          </div>
        )}

        {/* Products Tab */}
        {tab === 'products' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
              <h3 className="font-semibold text-white mb-4">Agregar producto al tenant</h3>
              <form onSubmit={handleAddProduct} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    required
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Precio (MXN)</label>
                  <input
                    type="number"
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: parseFloat(e.target.value) || 0 })}
                    required
                    min={0}
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Categoría</label>
                  <input
                    type="text"
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    placeholder="General"
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Descripción</label>
                  <input
                    type="text"
                    value={productForm.description}
                    onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    Agregar producto
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
              <p className="text-sm text-gray-400">
                Productos activos: <span className="text-white font-bold">{usage?.totalProducts ?? 0}</span>
              </p>
            </div>
          </div>
        )}

        {/* Conversations Tab */}
        {tab === 'conversations' && (
          <div className="space-y-4">
            {conversations.length > 0 ? (
              conversations.map((conv: any) => (
                <div key={conv.id} className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-white font-medium">{conv.customerName ?? 'Sin nombre'}</p>
                      <p className="text-xs text-gray-500">{conv.customerPhone} · {conv.channelType}</p>
                    </div>
                    <div className="text-right">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${conv.status === 'active' ? 'bg-green-900/40 text-green-300' : 'bg-gray-700 text-gray-400'}`}>{conv.status}</span>
                      <p className="text-[10px] text-gray-500 mt-1">{conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleString('es-MX') : ''}</p>
                    </div>
                  </div>
                  {conv.messages?.length > 0 && (
                    <div className="space-y-1.5 bg-gray-900 rounded-lg p-3 max-h-40 overflow-y-auto">
                      {conv.messages.map((m: any, i: number) => (
                        <div key={i} className={`text-xs ${m.direction === 'outbound' ? 'text-blue-300' : 'text-gray-300'}`}>
                          <span className="text-gray-600">{m.direction === 'outbound' ? '🤖' : '👤'}</span> {m.content?.slice(0, 200) ?? '[media]'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">Sin conversaciones</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UsageCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-gray-400 mt-1">{label}</p>
    </div>
  );
}
