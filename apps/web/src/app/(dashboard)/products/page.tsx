'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { TableSkeleton } from '@/components/ui/skeleton';

export default function ProductsPage() {
  const { data: products, loading, error, refetch } = useApi<any[]>('/products?all=true');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name || !price) return;
    setSaving(true);
    try {
      await api.post('/products', {
        name,
        price: parseFloat(price),
        category: category || undefined,
      });
      setName('');
      setPrice('');
      setCategory('');
      setShowForm(false);
      refetch();
    } catch (err) {
      alert('Error al crear producto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-sm text-gray-500">Catálogo y gestión de inventario</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showForm ? 'Cancelar' : '+ Nuevo producto'}
        </button>
      </div>

      {/* Formulario rápido */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del producto"
              className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Precio"
              type="number"
              step="0.01"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Categoría"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={saving || !name || !price}
            className="mt-3 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar producto'}
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : error ? (
          <div className="p-8 text-center text-red-500">{error}</div>
        ) : products && products.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Producto</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">SKU</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Precio</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Stock</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-900">{p.name}</p>
                    {p.category && <p className="text-xs text-gray-400">{p.category}</p>}
                  </td>
                  <td className="px-5 py-3 text-gray-500 font-mono text-xs">{p.sku ?? '—'}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">${p.price}</td>
                  <td className="px-5 py-3">
                    <span className={`text-sm font-medium ${
                      (p.stockAvailable ?? 0) <= (p.stockMinimum ?? 5)
                        ? 'text-red-600'
                        : 'text-gray-900'
                    }`}>
                      {p.stockAvailable ?? 0}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">
                      ({p.stockReserved ?? 0} reservado)
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {p.isActive ? (
                      <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">Activo</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Inactivo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-gray-400">
            No hay productos. Crea tu primer producto para empezar.
          </div>
        )}
      </div>
    </div>
  );
}
