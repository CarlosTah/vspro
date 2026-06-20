'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: product, loading } = useApi<any>(`/products/${id}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    stock: '',
    isActive: true,
    discount: '',
    discountType: 'percent',
    characteristics: [] as { key: string; value: string }[],
  });
  const [newCharKey, setNewCharKey] = useState('');
  const [newCharValue, setNewCharValue] = useState('');

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name ?? '',
        description: product.description ?? '',
        price: String(product.price ?? ''),
        category: product.category ?? '',
        stock: String(product.stockAvailable ?? product.stock ?? '50'),
        isActive: product.isActive !== false,
        discount: '',
        discountType: 'percent',
        characteristics: product.characteristics ?? [],
      });
    }
  }, [product]);

  const addCharacteristic = () => {
    if (!newCharKey.trim()) return;
    setForm({ ...form, characteristics: [...form.characteristics, { key: newCharKey, value: newCharValue }] });
    setNewCharKey('');
    setNewCharValue('');
  };

  const removeCharacteristic = (index: number) => {
    setForm({ ...form, characteristics: form.characteristics.filter((_, i) => i !== index) });
  };

  const handleSave = async () => {
    if (!form.name || !form.price) {
      setError('Nombre y precio son obligatorios');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.patch(`/products/${id}`, {
        name: form.name,
        price: parseFloat(form.price),
        category: form.category || 'General',
        description: form.description || undefined,
        isActive: form.isActive,
      });

      if (form.stock) {
        await api.patch(`/products/${id}/stock`, { stockAvailable: parseInt(form.stock) });
      }

      router.push('/products');
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;
    try {
      await api.delete(`/products/${id}`);
      router.push('/products');
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="p-8 text-gray-400 text-center">Cargando producto...</div>;
  if (!product) return <div className="p-8 text-red-400 text-center">Producto no encontrado</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => router.back()} className="text-sm text-accent hover:underline mb-1">← Volver a productos</button>
          <h1 className="text-2xl font-bold text-white">Editar Producto</h1>
          <p className="text-sm text-gray-400">SKU: {product.sku ?? '—'}</p>
        </div>
        <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 rounded-lg px-3 py-1.5">
          🗑️ Eliminar
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-500/50 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <div className="rounded-xl border border-card-border bg-card p-6 space-y-5">
        {/* Active toggle */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-700">
          <div>
            <p className="text-sm font-medium text-white">Producto activo</p>
            <p className="text-xs text-gray-400">Los productos inactivos no aparecen en el catálogo</p>
          </div>
          <button
            onClick={() => setForm({ ...form, isActive: !form.isActive })}
            className={`relative w-12 h-6 rounded-full transition-colors ${form.isActive ? 'bg-accent' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre *</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="vspro-input w-full" />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Descripción</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="vspro-input w-full resize-none" />
        </div>

        {/* Price + Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Precio (MXN) *</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-500">$</span>
              <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="vspro-input w-full pl-7" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Categoría</label>
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="vspro-input w-full" />
          </div>
        </div>

        {/* Stock + Discount */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Stock disponible</label>
            <input type="number" min="-1" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="vspro-input w-full" />
            <p className="text-xs text-gray-500 mt-1">-1 = ilimitado</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Descuento</label>
            <div className="flex gap-2">
              <input type="number" min="0" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} placeholder="0" className="vspro-input flex-1" />
              <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })} className="vspro-input w-20">
                <option value="percent">%</option>
                <option value="fixed">$</option>
              </select>
            </div>
          </div>
        </div>

        {/* Characteristics */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Características</label>
          {form.characteristics.length > 0 && (
            <div className="space-y-2 mb-3">
              {form.characteristics.map((c, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-3 py-2">
                  <span className="text-sm text-accent font-medium">{c.key}:</span>
                  <span className="text-sm text-white">{c.value}</span>
                  <button onClick={() => removeCharacteristic(i)} className="ml-auto text-red-400 text-xs">✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input value={newCharKey} onChange={(e) => setNewCharKey(e.target.value)} placeholder="Atributo" className="vspro-input flex-1" />
            <input value={newCharValue} onChange={(e) => setNewCharValue(e.target.value)} placeholder="Valor" className="vspro-input flex-1" onKeyDown={(e) => e.key === 'Enter' && addCharacteristic()} />
            <button onClick={addCharacteristic} className="px-3 py-2 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-600">+</button>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving} className="vspro-btn-primary disabled:opacity-50">
          {saving ? 'Guardando...' : '✓ Guardar cambios'}
        </button>
        <button onClick={() => router.back()} className="vspro-btn-secondary">Cancelar</button>
      </div>
    </div>
  );
}
