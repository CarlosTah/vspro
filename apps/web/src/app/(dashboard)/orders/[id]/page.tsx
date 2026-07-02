'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

const TIMELINE_STEPS = [
  { key: 'new', label: 'Nuevo', icon: '📋', color: 'blue' },
  { key: 'payment_pending', label: 'Pago pendiente', icon: '💳', color: 'yellow' },
  { key: 'payment_verified', label: 'Pagado', icon: '✅', color: 'green' },
  { key: 'in_production', label: 'En producción', icon: '🏭', color: 'orange' },
  { key: 'ready', label: 'Listo', icon: '📦', color: 'teal' },
  { key: 'shipped', label: 'Enviado', icon: '🛵', color: 'indigo' },
  { key: 'delivered', label: 'Entregado', icon: '🎉', color: 'green' },
];

const statusActions: Record<string, { label: string; nextStatus: string; color: string }[]> = {
  new: [{ label: 'Solicitar pago', nextStatus: 'payment_pending', color: 'yellow' }],
  payment_pending: [{ label: 'Verificar pago', nextStatus: 'payment_verified', color: 'green' }],
  payment_verified: [{ label: 'Enviar a producción', nextStatus: 'in_production', color: 'orange' }],
  in_production: [{ label: 'Marcar listo', nextStatus: 'ready', color: 'teal' }],
  ready: [
    { label: 'Entregar a repartidor', nextStatus: 'shipped', color: 'indigo' },
    { label: 'Entregado en mostrador', nextStatus: 'delivered', color: 'green' },
  ],
  shipped: [{ label: 'Confirmar entrega', nextStatus: 'delivered', color: 'green' }],
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, loading, error, refetch } = useApi<any>(`/orders/${id}`);
  const [transitioning, setTransitioning] = useState(false);

  const handleTransition = async (nextStatus: string) => {
    setTransitioning(true);
    try {
      await api.patch(`/orders/${id}/status`, { status: nextStatus });
      refetch();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando pedido...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!order) return <div className="p-8 text-center text-gray-400">Pedido no encontrado</div>;

  const currentStepIndex = TIMELINE_STEPS.findIndex(s => s.key === order.status);
  const actions = statusActions[order.status] ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.back()} className="text-sm text-accent hover:underline mb-1">
            ← Volver a pedidos
          </button>
          <h1 className="text-2xl font-bold text-white">{order.orderNumber}</h1>
          <p className="text-sm text-gray-400">
            {order.customerName} · {new Date(order.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-white">${parseFloat(order.total).toLocaleString('es-MX')}</p>
          <p className="text-sm text-gray-400">MXN</p>
          <button
            onClick={() => router.push(`/orders/${id}/print`)}
            className="mt-2 text-xs text-accent hover:underline"
          >
            🖨️ Imprimir ticket
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-xl border border-card-border bg-card p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-6">Seguimiento del pedido</h2>
        <div className="flex items-center justify-between relative">
          {/* Line */}
          <div className="absolute top-5 left-8 right-8 h-0.5 bg-gray-700" />
          <div
            className="absolute top-5 left-8 h-0.5 bg-accent transition-all duration-500"
            style={{ width: `${Math.max(0, (currentStepIndex / (TIMELINE_STEPS.length - 1)) * 100 - 5)}%` }}
          />

          {TIMELINE_STEPS.map((step, i) => {
            const isCompleted = i <= currentStepIndex;
            const isCurrent = i === currentStepIndex;
            const isCancelled = order.status === 'cancelled';

            return (
              <div key={step.key} className="flex flex-col items-center relative z-10">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${
                    isCancelled
                      ? 'bg-red-900/50 border-2 border-red-500'
                      : isCompleted
                      ? 'bg-accent/20 border-2 border-accent shadow-glow-sm'
                      : 'bg-gray-800 border-2 border-gray-600'
                  }`}
                >
                  {isCancelled && i === 0 ? '❌' : step.icon}
                </div>
                <span className={`mt-2 text-xs text-center max-w-[70px] ${
                  isCurrent ? 'text-accent font-semibold' : isCompleted ? 'text-gray-300' : 'text-gray-500'
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className="flex gap-3">
          {actions.map(action => (
            <button
              key={action.nextStatus}
              onClick={() => handleTransition(action.nextStatus)}
              disabled={transitioning}
              className="vspro-btn-primary disabled:opacity-50"
            >
              {transitioning ? 'Procesando...' : action.label}
            </button>
          ))}
          {order.status !== 'cancelled' && order.status !== 'delivered' && (
            <button
              onClick={() => handleTransition('cancelled')}
              disabled={transitioning}
              className="vspro-btn-secondary text-red-400 border-red-400/30 hover:bg-red-400/10"
            >
              Cancelar pedido
            </button>
          )}
        </div>
      )}

      {/* Order details grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Items */}
        <div className="rounded-xl border border-card-border bg-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">🛒 Productos</h3>
          {order.items && order.items.length > 0 ? (
            <div className="space-y-3">
              {order.items.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                  <div>
                    <p className="text-sm text-white font-medium">{item.productName ?? item.name}</p>
                    <p className="text-xs text-gray-400">x{item.quantity}</p>
                  </div>
                  <p className="text-sm text-white font-medium">
                    ${((item.price ?? item.unitPrice ?? 0) * item.quantity).toLocaleString('es-MX')}
                  </p>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 border-t border-gray-600">
                <span className="text-sm font-semibold text-gray-300">Total</span>
                <span className="text-lg font-bold text-white">${parseFloat(order.total).toLocaleString('es-MX')}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Sin productos detallados</p>
          )}
        </div>

        {/* Client info */}
        <div className="rounded-xl border border-card-border bg-card p-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">👤 Cliente</h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500">Nombre</p>
              <p className="text-sm text-white">{order.customerName ?? 'No disponible'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Canal</p>
              <p className="text-sm text-white capitalize">{order.channelType ?? 'whatsapp'}</p>
            </div>
            {order.shippingAddress && (
              <div>
                <p className="text-xs text-gray-500">Dirección de envío</p>
                <p className="text-sm text-white">
                  {typeof order.shippingAddress === 'string'
                    ? order.shippingAddress
                    : `${order.shippingAddress.street ?? ''} ${order.shippingAddress.city ?? ''}`}
                </p>
              </div>
            )}
            {order.notes && (
              <div>
                <p className="text-xs text-gray-500">Notas</p>
                <p className="text-sm text-gray-300 italic">{order.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
