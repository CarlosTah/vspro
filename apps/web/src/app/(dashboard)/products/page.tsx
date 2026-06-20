'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { TableSkeleton } from '@/components/ui/skeleton';

type ViewMode = 'grid' | 'table';

export default function ProductsPage() {
  const router = useRouter();
  const { data: products, loading, error, refetch } = useApi<any[]>('/products?all=true');
  const { data: templates } = useApi<any[]>('/industry-templates');
  const [view, setView] = useState<ViewMode>('grid');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // Get unique categories
  const categories = [...new Set(products?.map((p: any) => p.category).filter(Boolean) ?? [])];

  // Filter products
  const filtered = categoryFilter
    ? products?.filter((p: any) => p.category === categoryFilter)
    : products;

  const handleLoadTemplate = async (slug: string) => {
    if (!confirm('¿Cargar productos de esta plantilla? Se agregarán a tu catálogo actual.')) return;
    setLoadingTemplate(true);
    try {
      await api.post(`/industry-templates/${slug}/apply`);
      setShowTemplates(false);
      refetch();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoadingTemplate(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Productos</h1>
          <p className="text-sm text-gray-400">{products?.length ?? 0} productos en catálogo</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTemplates(!showTemplates)} className="vspro-btn-secondary text-sm">
            {showTemplates ? '✕ Cerrar' : '📋 Cargar plantilla'}
          </button>
          <button onClick={() => router.push('/products/new')} className="vspro-btn-primary text-sm">
            + Nuevo producto
          </button>
        </div>
      </div>

      {/* Template loader */}
      {showTemplates && templates && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Cargar productos de plantilla por giro</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {templates.map((t: any) => (
              <button
                key={t.slug}
                onClick={() => handleLoadTemplate(t.slug)}
                disabled={loadingTemplate}
                className="rounded-lg border border-gray-700 bg-gray-800 p-3 text-left hover:border-accent/50 transition-colors disabled:opacity-50"
              >
                <span className="text-xl">{t.icon}</span>
                <p className="text-xs text-white font-medium mt-1">{t.name}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters + View toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 overflow-x-auto">
          <button
            onClick={() => setCategoryFilter('')}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !categoryFilter ? 'bg-accent text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Todos
          </button>
          {categories.map((cat: string) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === cat ? 'bg-accent text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-800 rounded-lg p-0.5">
          <button onClick={() => setView('grid')} className={`px-2.5 py-1.5 rounded-md text-xs ${view === 'grid' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>▦</button>
          <button onClick={() => setView('table')} className={`px-2.5 py-1.5 rounded-md text-xs ${view === 'table' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>☰</button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : error ? (
        <div className="p-8 text-center text-red-400">{error}</div>
      ) : !filtered || filtered.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-card p-12 text-center">
          <p className="text-3xl mb-3">📦</p>
          <p className="text-white font-medium">Sin productos</p>
          <p className="text-sm text-gray-400 mt-1">Agrega tu primer producto o carga una plantilla</p>
          <div className="flex gap-2 justify-center mt-4">
            <button onClick={() => setShowTemplates(true)} className="vspro-btn-secondary text-sm">📋 Plantilla</button>
            <button onClick={() => router.push('/products/new')} className="vspro-btn-primary text-sm">+ Crear</button>
          </div>
        </div>
      ) : view === 'grid' ? (
        /* Grid view */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p: any) => (
            <div
              key={p.id}
              onClick={() => router.push(`/products/${p.id}`)}
              className="rounded-xl border border-card-border bg-card overflow-hidden cursor-pointer hover:border-accent/40 transition-colors"
            >
              {/* Image */}
              <div className="aspect-square bg-gray-800 flex items-center justify-center overflow-hidden">
                {p.images && p.images.length > 0 ? (
                  <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl opacity-30">📦</span>
                )}
              </div>
              {/* Info */}
              <div className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{p.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{p.category ?? 'General'}</p>
                  </div>
                  {!p.isActive && (
                    <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs text-gray-400 ml-1">Off</span>
                  )}
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <p className="text-lg font-bold text-accent">${parseFloat(p.price).toLocaleString('es-MX')}</p>
                  <p className="text-xs text-gray-500">Stock: {p.stockAvailable ?? '—'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table view */
        <div className="rounded-xl border border-card-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-700">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-gray-400">Producto</th>
                <th className="px-5 py-3 text-left font-medium text-gray-400">Categoría</th>
                <th className="px-5 py-3 text-left font-medium text-gray-400">Precio</th>
                <th className="px-5 py-3 text-left font-medium text-gray-400">Stock</th>
                <th className="px-5 py-3 text-left font-medium text-gray-400">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {filtered.map((p: any) => (
                <tr key={p.id} onClick={() => router.push(`/products/${p.id}`)} className="hover:bg-gray-800/50 cursor-pointer">
                  <td className="px-5 py-3">
                    <p className="text-white font-medium">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.sku}</p>
                  </td>
                  <td className="px-5 py-3 text-gray-300">{p.category ?? 'General'}</td>
                  <td className="px-5 py-3 text-accent font-medium">${parseFloat(p.price).toLocaleString('es-MX')}</td>
                  <td className="px-5 py-3 text-gray-300">{p.stockAvailable ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${p.isActive !== false ? 'bg-green-900/40 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
                      {p.isActive !== false ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
