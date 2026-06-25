'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

export default function KitchenPage() {
  const router = useRouter();
  const { data: queue, loading, refetch } = useApi<any[]>('/production/queue');
  const { data: products } = useApi<any[]>('/products');
  const [showQuickOrder, setShowQuickOrder] = useState(false);
  const [quickCart, setQuickCart] = useState<{ id: string; name: string; price: number; qty: number }[]>([]);
  const [quickType, setQuickType] = useState<'pickup' | 'delivery'>('pickup');
  const [savingQuick, setSavingQuick] = useState(false);
  const [autoPrint, setAutoPrint] = useState(true);
  const prevCount = useRef(0);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(refetch, 15000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Play sound and auto-print when new order arrives
  useEffect(() => {
    if (queue && queue.length > prevCount.current && prevCount.current > 0) {
      try { new Audio('/notification.mp3').play().catch(() => {}); } catch {}
      // Auto-print: open print dialog for the newest order ticket
      const newOrders = queue.slice(0, queue.length - prevCount.current);
      if (newOrders.length > 0 && autoPrint) {
        const newest = newOrders[0];
        const printWindow = window.open(`/orders/${newest.id}/print`, '_blank', 'width=400,height=600');
        if (printWindow) {
          printWindow.onload = () => { printWindow.print(); };
        }
      }
    }
    prevCount.current = queue?.length ?? 0;
  }, [queue]);

  const handleStart = async (orderId: string) => {
    await api.post(`/production/${orderId}/start`);
    refetch();
  };

  const handleReady = async (orderId: string) => {
    await api.post(`/production/${orderId}/ready`);
    refetch();
  };

  const addToQuickCart = (product: any) => {
    const existing = quickCart.find(i => i.id === product.id);
    if (existing) {
      setQuickCart(quickCart.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setQuickCart([...quickCart, { id: product.id, name: product.name, price: parseFloat(product.price), qty: 1 }]);
    }
  };

  const handleQuickOrder = async () => {
    if (quickCart.length === 0) return;
    setSavingQuick(true);
    try {
      await api.post('/orders', {
        customerId: null,
        channelType: 'manual',
        items: quickCart.map(i => ({ productId: i.id, quantity: i.qty })),
        notes: `Pedido mostrador (${quickType === 'pickup' ? 'Recoger' : 'Envío'})`,
        status: 'payment_verified',
      });
      setQuickCart([]);
      setShowQuickOrder(false);
      refetch();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingQuick(false);
    }
  };

  const getElapsedMinutes = (date: string) => {
    return Math.round((Date.now() - new Date(date).getTime()) / 60000);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🍳 Cocina</h1>
          <p className="text-sm text-gray-400">
            {queue?.length ?? 0} pedidos en cola
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={(e) => setAutoPrint(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-900 text-blue-500"
            />
            <span className="text-xs text-gray-400">Auto-print</span>
          </label>
          <button onClick={() => setShowQuickOrder(!showQuickOrder)} className="vspro-btn-secondary text-sm">
            {showQuickOrder ? '✕ Cerrar' : '+ Pedido rápido'}
          </button>
          <button onClick={() => refetch()} className="px-3 py-2 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600">
            🔄
          </button>
        </div>
      </div>

      {/* Quick Order Modal */}
      {showQuickOrder && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Pedido rápido (mostrador)</h3>

          {/* Type selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setQuickType('pickup')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${quickType === 'pickup' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}
            >
              📍 Recoger
            </button>
            <button
              onClick={() => setQuickType('delivery')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${quickType === 'delivery' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
            >
              🛵 Envío
            </button>
          </div>

          {/* Product grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
            {products?.filter((p: any) => p.isActive !== false).map((p: any) => (
              <button key={p.id} onClick={() => addToQuickCart(p)}
                className="rounded-lg border border-gray-700 bg-gray-800 p-2 text-left hover:border-accent/50 transition-colors">
                <p className="text-xs text-white font-medium truncate">{p.name}</p>
                <p className="text-xs text-accent">${parseFloat(p.price).toFixed(0)}</p>
              </button>
            ))}
          </div>

          {/* Cart summary */}
          {quickCart.length > 0 && (
            <div className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2">
              <div className="text-sm text-white">
                {quickCart.map(i => `${i.qty}x ${i.name}`).join(', ')}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-accent">
                  ${quickCart.reduce((s, i) => s + i.price * i.qty, 0).toFixed(0)}
                </span>
                <button onClick={handleQuickOrder} disabled={savingQuick} className="vspro-btn-primary text-xs px-3 py-1.5 disabled:opacity-50">
                  {savingQuick ? '...' : '✓ Crear'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Orders queue */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Cargando cola...</div>
      ) : !queue || queue.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">✅</p>
          <p className="text-xl text-white font-medium">Sin pedidos pendientes</p>
          <p className="text-sm text-gray-400 mt-1">Los nuevos pedidos aparecerán aquí automáticamente</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {queue.map((order: any) => {
            const items = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items ?? []);
            const elapsed = getElapsedMinutes(order.createdAt);
            const isUrgent = elapsed > 30;
            const isInProgress = order.status === 'in_production';
            const hasAddress = !!order.shippingAddress;

            return (
              <div
                key={order.id}
                className={`rounded-xl border p-5 transition-all ${
                  isUrgent ? 'border-red-500/50 bg-red-900/10' :
                  isInProgress ? 'border-orange-500/50 bg-orange-900/10' :
                  'border-card-border bg-card'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white">{order.orderNumber}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      hasAddress ? 'bg-blue-900/40 text-blue-300' : 'bg-green-900/40 text-green-300'
                    }`}>
                      {hasAddress ? '🛵 Envío' : '📍 Recoger'}
                    </span>
                  </div>
                  <div className={`text-sm font-mono font-bold ${isUrgent ? 'text-red-400' : 'text-gray-400'}`}>
                    ⏱ {elapsed} min
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-1 mb-3">
                  {items.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-base text-white font-medium">
                        {item.quantity}× {item.productName ?? item.name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                {order.notes && (
                  <div className="rounded-lg bg-yellow-900/20 border border-yellow-700/30 px-3 py-2 mb-3">
                    <p className="text-xs text-yellow-300">📝 {order.notes}</p>
                  </div>
                )}

                {/* Customer */}
                <p className="text-xs text-gray-500 mb-3">
                  👤 {order.customerName ?? 'Mostrador'} · ${parseFloat(order.total).toFixed(0)}
                </p>

                {/* Actions */}
                <div className="flex gap-2">
                  {!isInProgress ? (
                    <button onClick={() => handleStart(order.id)} className="flex-1 py-2.5 rounded-lg bg-orange-600 text-white font-semibold text-sm hover:bg-orange-700">
                      🔥 Preparando
                    </button>
                  ) : (
                    <button onClick={() => handleReady(order.id)} className="flex-1 py-2.5 rounded-lg bg-green-600 text-white font-semibold text-sm hover:bg-green-700">
                      ✅ Listo
                    </button>
                  )}
                  <button
                    onClick={() => router.push(`/orders/${order.id}/print`)}
                    className="px-3 py-2.5 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600"
                    title="Imprimir ticket"
                  >
                    🖨️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
