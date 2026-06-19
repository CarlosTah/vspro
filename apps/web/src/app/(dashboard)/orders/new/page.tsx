'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

interface CartItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
}

export default function NewOrderPage() {
  const router = useRouter();
  const { data: products } = useApi<any[]>('/products');
  const { data: customers } = useApi<any[]>('/customers');

  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addToCart = (product: any) => {
    const existing = cart.find(i => i.productId === product.id);
    if (existing) {
      setCart(cart.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setCart([...cart, {
        productId: product.id,
        productName: product.name,
        price: parseFloat(product.price),
        quantity: 1,
      }]);
    }
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart(cart.filter(i => i.productId !== productId));
    } else {
      setCart(cart.map(i => i.productId === productId ? { ...i, quantity: qty } : i));
    }
  };

  const removeItem = (productId: string) => {
    setCart(cart.filter(i => i.productId !== productId));
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleSubmit = async () => {
    setError('');
    if (!selectedCustomer && !newCustomerName) {
      setError('Selecciona o crea un cliente');
      return;
    }
    if (cart.length === 0) {
      setError('Agrega al menos un producto al pedido');
      return;
    }

    setSaving(true);
    try {
      let customerId = selectedCustomer;

      // Create new customer if needed
      if (showNewCustomer && newCustomerName) {
        const newCust = await api.post<any>('/customers', {
          name: newCustomerName,
          phone: newCustomerPhone,
          channelType: 'manual',
          channelId: `manual-${Date.now()}`,
        });
        customerId = newCust.id;
      }

      // Create order
      const order = await api.post<any>('/orders', {
        customerId,
        channelType: 'manual',
        items: cart.map(i => ({ productId: i.productId, quantity: i.quantity })),
        notes: notes || undefined,
      });

      router.push(`/orders/${order.id}`);
    } catch (err: any) {
      setError(err.message ?? 'Error al crear pedido');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <button onClick={() => router.back()} className="text-sm text-accent hover:underline mb-1">
          ← Volver a pedidos
        </button>
        <h1 className="text-2xl font-bold text-white">Nuevo Pedido</h1>
        <p className="text-sm text-gray-400">Crea un pedido manualmente desde el panel</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-500/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Client + Products */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client Selection */}
          <div className="rounded-xl border border-card-border bg-card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">👤 Cliente</h3>
            {!showNewCustomer ? (
              <div className="space-y-3">
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  className="w-full vspro-input"
                >
                  <option value="">Seleccionar cliente...</option>
                  {customers?.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone ?? c.email ?? c.channelId})</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewCustomer(true)}
                  className="text-sm text-accent hover:underline"
                >
                  + Crear cliente nuevo
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full vspro-input"
                />
                <input
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  placeholder="Teléfono (opcional)"
                  className="w-full vspro-input"
                />
                <button
                  onClick={() => { setShowNewCustomer(false); setNewCustomerName(''); setNewCustomerPhone(''); }}
                  className="text-sm text-gray-400 hover:underline"
                >
                  ← Seleccionar cliente existente
                </button>
              </div>
            )}
          </div>

          {/* Product Selection */}
          <div className="rounded-xl border border-card-border bg-card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">📦 Agregar productos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {products?.filter((p: any) => p.isActive !== false).map((product: any) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2.5 text-left hover:border-accent/50 hover:bg-gray-800 transition-colors"
                >
                  <div>
                    <p className="text-sm text-white font-medium">{product.name}</p>
                    <p className="text-xs text-gray-400">{product.category ?? 'General'}</p>
                  </div>
                  <span className="text-sm text-accent font-semibold">${parseFloat(product.price).toLocaleString('es-MX')}</span>
                </button>
              ))}
              {(!products || products.length === 0) && (
                <p className="text-sm text-gray-500 col-span-2">No hay productos. Crea uno en Productos.</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-card-border bg-card p-5">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">📝 Notas del pedido</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instrucciones especiales, dirección de envío, etc."
              rows={3}
              className="w-full vspro-input resize-none"
            />
          </div>
        </div>

        {/* Right: Cart summary */}
        <div className="space-y-4">
          <div className="rounded-xl border border-card-border bg-card p-5 sticky top-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-4">🛒 Resumen</h3>

            {cart.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Agrega productos al pedido</p>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.productId} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{item.productName}</p>
                      <p className="text-xs text-gray-400">${item.price} × {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        className="w-6 h-6 rounded bg-gray-700 text-white text-xs hover:bg-gray-600"
                      >
                        −
                      </button>
                      <span className="text-sm text-white w-4 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        className="w-6 h-6 rounded bg-gray-700 text-white text-xs hover:bg-gray-600"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="ml-1 text-red-400 text-xs hover:text-red-300"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                <div className="border-t border-gray-700 pt-3 mt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-300">Total</span>
                    <span className="text-xl font-bold text-white">${total.toLocaleString('es-MX')}</span>
                  </div>
                  <p className="text-xs text-gray-500 text-right">MXN</p>
                </div>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={saving || cart.length === 0}
              className="w-full mt-4 vspro-btn-primary disabled:opacity-50"
            >
              {saving ? 'Creando pedido...' : `Crear pedido · $${total.toLocaleString('es-MX')}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
