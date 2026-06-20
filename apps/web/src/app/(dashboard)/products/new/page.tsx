'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function NewProductPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    stock: '50',
    discount: '',
    discountType: 'percent',
    characteristics: [] as { key: string; value: string }[],
  });
  const [newCharKey, setNewCharKey] = useState('');
  const [newCharValue, setNewCharValue] = useState('');

  const addCharacteristic = () => {
    if (!newCharKey.trim()) return;
    setForm({ ...form, characteristics: [...form.characteristics, { key: newCharKey, value: newCharValue }] });
    setNewCharKey('');
    setNewCharValue('');
  };

  const removeCharacteristic = (index: number) => {
    setForm({ ...form, characteristics: form.characteristics.filter((_, i) => i !== index) });
  };

  const handleSubmit = async () => {
    if (!form.name || !form.price) {
      setError('Nombre y precio son obligatorios');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const productData: any = {
        name: form.name,
        price: parseFloat(form.price),
        category: form.category || 'General',
        description: form.description || undefined,
      };

      // Create product
      const product = await api.post<any>('/products', productData);

      // Update stock if different from default
      if (form.stock && parseInt(form.stock) !== 50) {
        await api.patch(`/products/${product.id}/stock`, { stockAvailable: parseInt(form.stock) });
      }

      // Redirect to edit page so user can add images
      router.push(`/products/${product.id}`);
    } catch (err: any) {
      setError(err.message ?? 'Error al crear producto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <button onClick={() => router.back()} className="text-sm text-accent hover:underline mb-1">← Volver a productos</button>
        <h1 className="text-2xl font-bold text-white">Nuevo Producto</h1>
        <p className="text-sm text-gray-400">Agrega un producto o servicio a tu catálogo</p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-500/50 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <div className="rounded-xl border border-card-border bg-card p-6 space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre del producto *</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej: Taco al Pastor, Corte Clásico, Vestido Floral"
            className="vspro-input w-full"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Descripción</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Descripción breve del producto o servicio"
            rows={3}
            className="vspro-input w-full resize-none"
          />
        </div>

        {/* Price + Category row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Precio (MXN) *</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="0.00"
                className="vspro-input w-full pl-7"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Categoría</label>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Ej: Tacos, Cortes, Vestidos, Servicios"
              className="vspro-input w-full"
            />
          </div>
        </div>

        {/* Stock + Discount row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Stock disponible</label>
            <input
              type="number"
              min="0"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
              placeholder="50"
              className="vspro-input w-full"
            />
            <p className="text-xs text-gray-500 mt-1">Usa -1 para stock ilimitado (servicios)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Descuento (opcional)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
                placeholder="0"
                className="vspro-input flex-1"
              />
              <select
                value={form.discountType}
                onChange={(e) => setForm({ ...form, discountType: e.target.value })}
                className="vspro-input w-20"
              >
                <option value="percent">%</option>
                <option value="fixed">$</option>
              </select>
            </div>
          </div>
        </div>

        {/* Characteristics */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Características</label>
          <p className="text-xs text-gray-500 mb-2">Agrega atributos como talla, color, material, ingredientes, etc.</p>

          {form.characteristics.length > 0 && (
            <div className="space-y-2 mb-3">
              {form.characteristics.map((c, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-2">
                  <span className="text-sm text-accent font-medium">{c.key}:</span>
                  <span className="text-sm text-white">{c.value}</span>
                  <button onClick={() => removeCharacteristic(i)} className="ml-auto text-red-400 text-xs hover:text-red-300">✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={newCharKey}
              onChange={(e) => setNewCharKey(e.target.value)}
              placeholder="Atributo (ej: Color)"
              className="vspro-input flex-1"
            />
            <input
              value={newCharValue}
              onChange={(e) => setNewCharValue(e.target.value)}
              placeholder="Valor (ej: Rojo)"
              className="vspro-input flex-1"
              onKeyDown={(e) => e.key === 'Enter' && addCharacteristic()}
            />
            <button onClick={addCharacteristic} className="px-3 py-2 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-600">+</button>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={saving || !form.name || !form.price}
          className="vspro-btn-primary disabled:opacity-50"
        >
          {saving ? 'Creando...' : '✓ Crear producto'}
        </button>
        <button onClick={() => router.back()} className="vspro-btn-secondary">Cancelar</button>
      </div>
    </div>
  );
}
