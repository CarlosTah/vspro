'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { TableSkeleton } from '@/components/ui/skeleton';

export default function PaymentsPage() {
  const { data: orders, loading } = useApi<any[]>('/orders?status=payment_pending');
  const [verifying, setVerifying] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // Form de verificación manual
  const [showForm, setShowForm] = useState(false);
  const [formOrderId, setFormOrderId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState('transfer');
  const [formReference, setFormReference] = useState('');

  const handleVerifyManual = async () => {
    if (!formOrderId || !formAmount) return;
    setVerifying(formOrderId);
    setResult(null);
    try {
      const res = await api.post('/payments/verify-manual', {
        orderId: formOrderId,
        amount: parseFloat(formAmount),
        method: formMethod,
        reference: formReference || undefined,
      });
      setResult(res.message);
      setShowForm(false);
      setFormOrderId('');
      setFormAmount('');
      setFormReference('');
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
    } finally {
      setVerifying(null);
    }
  };

  const handleVerifyImage = async (orderId: string) => {
    const imageUrl = prompt('URL de la imagen del comprobante:');
    if (!imageUrl) return;
    setVerifying(orderId);
    setResult(null);
    try {
      const res = await api.post('/payments/verify-by-image', {
        orderId,
        proofImageUrl: imageUrl,
      });
      setResult(res.message);
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
    } finally {
      setVerifying(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pagos</h1>
          <p className="text-sm text-gray-500">Verificación de comprobantes y registro de cobros</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showForm ? 'Cancelar' : '+ Verificar pago manual'}
        </button>
      </div>

      {result && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          result.startsWith('Error') || result.startsWith('⚠️')
            ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
            : 'bg-green-50 text-green-700 border border-green-200'
        }`}>
          {result}
        </div>
      )}

      {/* Formulario de verificación manual */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="font-medium text-gray-900">Verificar pago manualmente</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Pedido</label>
              <select
                value={formOrderId}
                onChange={(e) => setFormOrderId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Seleccionar pedido...</option>
                {orders?.map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} — {o.customerName} — ${o.total}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto recibido</label>
              <input
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="350.00"
                type="number"
                step="0.01"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Método</label>
              <select
                value={formMethod}
                onChange={(e) => setFormMethod(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="transfer">Transferencia</option>
                <option value="cash">Efectivo</option>
                <option value="stripe">Tarjeta (Stripe)</option>
                <option value="mercadopago">MercadoPago</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Referencia (opcional)</label>
              <input
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
                placeholder="Número de referencia bancaria"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            onClick={handleVerifyManual}
            disabled={!formOrderId || !formAmount || !!verifying}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {verifying ? 'Verificando...' : 'Confirmar pago ✓'}
          </button>
        </div>
      )}

      {/* Pedidos pendientes de pago */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="font-semibold text-gray-900">Pedidos pendientes de pago</h3>
        </div>
        {loading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : orders && orders.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {orders.map((order: any) => (
              <div key={order.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{order.orderNumber}</p>
                  <p className="text-xs text-gray-500">{order.customerName} · Total: ${order.total}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVerifyImage(order.id)}
                    disabled={verifying === order.id}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    📷 Verificar con imagen
                  </button>
                  <button
                    onClick={() => { setFormOrderId(order.id); setFormAmount(order.total); setShowForm(true); }}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  >
                    ✓ Confirmar manual
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">
            No hay pedidos pendientes de pago
          </div>
        )}
      </div>
    </div>
  );
}
