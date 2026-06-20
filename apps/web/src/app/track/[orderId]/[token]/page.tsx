'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const statusSteps = [
  { key: 'offered', label: 'Asignado', icon: '📋' },
  { key: 'accepted', label: 'Aceptado', icon: '✅' },
  { key: 'picked_up', label: 'Recogido', icon: '📦' },
  { key: 'delivered', label: 'Entregado', icon: '🎉' },
];

export default function TrackingPage() {
  const { orderId, token } = useParams<{ orderId: string; token: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/track/${orderId}/${token}`);
      if (!res.ok) throw new Error('Enlace no válido o expirado');
      setData(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orderId, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = async (action: string) => {
    setActing(true);
    setActionMsg('');
    try {
      const res = await fetch(`${API_URL}/track/${orderId}/${token}/${action}`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message ?? 'Error');
      setActionMsg(result.message);
      fetchData();
    } catch (err: any) {
      setActionMsg(`Error: ${err.message}`);
    } finally {
      setActing(false);
    }
  };

  if (loading) return <Page><p className="text-center text-gray-500 py-10">Cargando...</p></Page>;
  if (error) return <Page><p className="text-center text-red-500 py-10">{error}</p></Page>;
  if (!data) return null;

  const currentStep = statusSteps.findIndex(s => s.key === data.status);
  const address = data.address
    ? typeof data.address === 'object'
      ? `${data.address.street ?? ''} ${data.address.colony ?? ''} ${data.address.city ?? ''}`.trim()
      : data.address
    : 'No especificada';

  return (
    <Page>
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 rounded-full px-4 py-1.5 text-sm font-medium mb-3">
          🛵 Entrega VSPRO
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Pedido {data.orderNumber}</h1>
        <p className="text-gray-500 text-sm">Asignado a: {data.driverName}</p>
      </div>

      {/* Timeline */}
      <div className="flex items-center justify-between mb-8 px-2">
        {statusSteps.map((step, i) => {
          const isDone = i <= currentStep;
          const isCurrent = i === currentStep;
          return (
            <div key={step.key} className="flex flex-col items-center relative">
              {i > 0 && (
                <div className={`absolute top-4 -left-full w-full h-0.5 ${i <= currentStep ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base z-10 ${
                isDone ? 'bg-green-100 border-2 border-green-500' : 'bg-gray-100 border-2 border-gray-300'
              }`}>
                {step.icon}
              </div>
              <span className={`mt-1 text-xs ${isCurrent ? 'text-green-700 font-semibold' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Order info */}
      <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Cliente</span>
          <span className="text-sm font-medium text-gray-900">{data.customerName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Dirección</span>
          <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">{address}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-500">Total</span>
          <span className="text-sm font-bold text-gray-900">${parseFloat(data.total).toLocaleString('es-MX')} MXN</span>
        </div>
      </div>

      {/* Items */}
      {data.items && data.items.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <p className="text-xs text-gray-500 mb-2 font-medium">PRODUCTOS:</p>
          {(typeof data.items === 'string' ? JSON.parse(data.items) : data.items).map((item: any, i: number) => (
            <div key={i} className="flex justify-between py-1">
              <span className="text-sm text-gray-700">{item.productName ?? item.name} × {item.quantity}</span>
              <span className="text-sm text-gray-900">${((item.price ?? item.unitPrice ?? 0) * item.quantity).toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action message */}
      {actionMsg && (
        <div className={`rounded-lg px-4 py-3 mb-4 text-sm text-center ${
          actionMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          {actionMsg}
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        {data.canAccept && (
          <button
            onClick={() => handleAction('accept')}
            disabled={acting}
            className="w-full py-3.5 rounded-xl bg-green-600 text-white font-semibold text-base hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {acting ? 'Procesando...' : '✅ Aceptar entrega'}
          </button>
        )}
        {data.canPickup && (
          <button
            onClick={() => handleAction('pickup')}
            disabled={acting}
            className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-base hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {acting ? 'Procesando...' : '📦 Confirmar recogida'}
          </button>
        )}
        {data.canDeliver && (
          <button
            onClick={() => handleAction('deliver')}
            disabled={acting}
            className="w-full py-3.5 rounded-xl bg-purple-600 text-white font-semibold text-base hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {acting ? 'Procesando...' : '🎉 Confirmar entrega'}
          </button>
        )}
        {data.status === 'delivered' && (
          <div className="text-center py-6">
            <p className="text-3xl mb-2">🎉</p>
            <p className="text-lg font-bold text-green-700">¡Entrega completada!</p>
            <p className="text-sm text-gray-500">Gracias por tu servicio</p>
          </div>
        )}
      </div>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-4 py-6">
        {children}
        <p className="text-center text-xs text-gray-400 mt-8">Powered by VSPRO · vspro.app</p>
      </div>
    </div>
  );
}
