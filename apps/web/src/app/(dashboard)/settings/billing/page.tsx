'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

export default function BillingPage() {
  const { data: subscription, loading } = useApi<any>('/billing/subscription');
  const { data: usage } = useApi<any>('/billing/usage');
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingUpgrade, setLoadingUpgrade] = useState(false);

  const openPortal = async () => {
    setLoadingPortal(true);
    try {
      const result = await api.post<any>('/billing/portal');
      window.open(result.url, '_blank');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingPortal(false);
    }
  };

  const upgradePlan = async (planSlug: string) => {
    setLoadingUpgrade(true);
    try {
      const result = await api.post<any>('/billing/checkout', { planSlug });
      window.open(result.url, '_blank');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingUpgrade(false);
    }
  };

  if (loading) return <div className="p-8 text-gray-400 text-center">Cargando...</div>;

  const plan = subscription?.plan ?? {};
  const status = subscription?.status ?? 'TRIALING';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Plan y Facturación</h1>
        <p className="text-sm text-gray-400">Gestiona tu suscripción y métodos de pago</p>
      </div>

      {/* Current plan */}
      <div className="rounded-xl border border-card-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-300">Plan actual</h3>
            <p className="text-2xl font-bold text-white mt-1">{plan.name ?? 'Básico'}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${
            status === 'ACTIVE' ? 'bg-green-900/40 text-green-300' :
            status === 'TRIALING' ? 'bg-blue-900/40 text-blue-300' :
            'bg-yellow-900/40 text-yellow-300'
          }`}>
            {status === 'ACTIVE' ? '✓ Activo' : status === 'TRIALING' ? '⏳ Trial' : status}
          </span>
        </div>

        {/* Trial banner */}
        {status === 'TRIALING' && (
          <div className="rounded-lg bg-blue-900/30 border border-blue-700 p-4 mb-4">
            <p className="text-sm text-blue-300 font-medium">Estás en periodo de prueba gratuita</p>
            <p className="text-xs text-blue-400 mt-1">
              {subscription?.trialEndsAt
                ? `Tu trial vence el ${new Date(subscription.trialEndsAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}.`
                : 'Tienes 7 días para probar todas las funciones.'}
              {' '}Agrega tu tarjeta ahora para no perder el servicio al vencer.
            </p>
          </div>
        )}

        <div className="flex items-baseline gap-1 mb-4">
          <span className="text-3xl font-bold text-accent">${plan.priceMonthly ?? '990'}</span>
          <span className="text-gray-400">/mes MXN</span>
        </div>

        {/* Billing info for active subscriptions */}
        {status === 'ACTIVE' && subscription?.currentPeriodEnd && (
          <div className="bg-gray-900 rounded-lg p-3 mb-4 text-xs text-gray-400 space-y-1">
            <p>📅 Próximo cobro: <span className="text-white font-medium">{new Date(subscription.currentPeriodEnd).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</span></p>
            <p>💳 Monto: <span className="text-white font-medium">${plan.priceMonthly ?? '990'} MXN</span></p>
            <p>🔄 Cobro recurrente mensual automático</p>
          </div>
        )}

        {/* Usage */}
        {usage && (
          <div className="grid grid-cols-2 gap-3 mb-4 pt-4 border-t border-gray-700">
            <UsageMeter label="Pedidos" used={usage.ordersCount ?? 0} max={usage.maxOrders ?? 20} />
            <UsageMeter label="Mensajes" used={usage.messagesSent ?? 0} max={usage.maxMessages ?? 1000} />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-700">
          {status === 'TRIALING' ? (
            <button onClick={() => upgradePlan(plan.slug ?? 'basic')} disabled={loadingUpgrade} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {loadingUpgrade ? '...' : '💳 Agregar tarjeta y activar plan'}
            </button>
          ) : (
            <>
              <button onClick={openPortal} disabled={loadingPortal} className="vspro-btn-secondary text-sm disabled:opacity-50">
                {loadingPortal ? '...' : '💳 Cambiar tarjeta'}
              </button>
              <button onClick={openPortal} disabled={loadingPortal} className="vspro-btn-secondary text-sm disabled:opacity-50">
                📄 Ver facturas y comprobantes
              </button>
            </>
          )}
        </div>
      </div>

      {/* Upgrade options */}
      <div className="rounded-xl border border-card-border bg-card p-6">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Cambiar de plan</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { slug: 'basic', name: 'Básico', price: '$990', features: '20 pedidos, 10 productos, WhatsApp' },
            { slug: 'pro', name: 'Profesional', price: '$1,490', features: '70 pedidos, 50 productos, 3 canales' },
            { slug: 'enterprise', name: 'Avanzado', price: '$2,499', features: 'Ilimitado, marca blanca' },
          ].map(p => (
            <div key={p.slug} className={`rounded-lg border p-4 ${plan.slug === p.slug ? 'border-accent bg-accent/10' : 'border-gray-700'}`}>
              <p className="text-white font-semibold">{p.name}</p>
              <p className="text-accent font-bold text-lg">{p.price}<span className="text-xs text-gray-400">/mes</span></p>
              <p className="text-xs text-gray-400 mt-1">{p.features}</p>
              {plan.slug !== p.slug && (
                <button onClick={() => upgradePlan(p.slug)} disabled={loadingUpgrade} className="mt-3 w-full py-1.5 rounded-lg bg-gray-700 text-white text-xs hover:bg-gray-600 disabled:opacity-50">
                  Cambiar
                </button>
              )}
              {plan.slug === p.slug && (
                <p className="mt-3 text-xs text-accent text-center">Plan actual</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsageMeter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const isHigh = pct > 80;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className={isHigh ? 'text-red-400' : 'text-gray-300'}>{used}/{max === -1 ? '∞' : max}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${isHigh ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
