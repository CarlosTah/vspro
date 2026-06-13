'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  orderId: string;
  orderNumber: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CARRIERS = [
  { value: 'fedex', label: 'FedEx' },
  { value: 'dhl', label: 'DHL' },
  { value: 'estafeta', label: 'Estafeta' },
  { value: '99minutos', label: '99 Minutos' },
  { value: 'skydropx', label: 'Skydropx' },
  { value: 'otro', label: 'Otra paquetería' },
];

export function ShipmentModal({ orderId, orderNumber, onClose, onSuccess }: Props) {
  const [carrier, setCarrier] = useState('fedex');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [cost, setCost] = useState('');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingNumber) return;

    setLoading(true);
    setError('');
    try {
      await api.post('/shipments', {
        orderId,
        carrier,
        trackingNumber,
        cost: cost ? parseFloat(cost) : undefined,
        estimatedDelivery: estimatedDelivery || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error al crear envío');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Registrar envío</h2>
            <p className="text-sm text-gray-500">Pedido {orderNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paquetería</label>
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {CARRIERS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Número de guía</label>
            <input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="FDX-123456789"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Costo de envío</label>
              <input
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="$0.00"
                type="number"
                step="0.01"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entrega estimada</label>
              <input
                value={estimatedDelivery}
                onChange={(e) => setEstimatedDelivery(e.target.value)}
                type="date"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
            <p className="text-xs text-blue-700">
              📱 Al confirmar, el cliente recibirá automáticamente un mensaje con el número de guía y link de rastreo.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !trackingNumber}
              className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Confirmar envío 📦'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
