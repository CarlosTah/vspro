'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';

const MEDIA_TYPES = [
  { value: 'menu', label: '📋 Menú', desc: 'Carta de productos/servicios' },
  { value: 'promo', label: '🏷️ Promociones', desc: 'Ofertas y descuentos activos' },
  { value: 'catalog', label: '📖 Catálogo', desc: 'Catálogo completo de productos' },
  { value: 'general', label: '📷 General', desc: 'Material gráfico general' },
];

export default function MediaSettingsPage() {
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState('menu');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAssets(); }, []);

  const loadAssets = async () => {
    try {
      const data = await api.get('/media-assets');
      setAssets(data);
    } catch { setAssets([]); }
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem('vspro_token');
      const tenantSlug = localStorage.getItem('vspro_tenant_slug');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', selectedType);
      formData.append('title', file.name.split('.')[0]);

      const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
      const res = await fetch(`${API_URL}/media-assets/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-slug': tenantSlug ?? '',
        },
        body: formData,
      });
      const result = await res.json();
      if (result.id) loadAssets();
      else alert(result.message ?? 'Error al subir');
    } catch (err: any) { alert(err.message); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este material?')) return;
    await api.delete(`/media-assets/${id}`);
    loadAssets();
  };

  const groupedAssets = MEDIA_TYPES.map(t => ({
    ...t,
    assets: assets.filter(a => a.type === t.value),
  }));

  if (loading) return <div className="p-8 text-gray-400 text-center">Cargando...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Material Gráfico</h1>
        <p className="text-sm text-gray-400">Sube menús, promociones y catálogos. Tu agente IA los enviará automáticamente cuando el cliente lo pida.</p>
      </div>

      {/* Upload section */}
      <div className="rounded-xl border border-card-border bg-card p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Subir material</h3>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Tipo</label>
            <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="vspro-input">
              {MEDIA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? 'Subiendo...' : '📤 Subir imagen'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Formatos: JPG, PNG, PDF. El agente IA enviará este material cuando el cliente lo solicite.</p>
      </div>

      {/* Assets by type */}
      {groupedAssets.map(group => (
        <div key={group.value} className="rounded-xl border border-card-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">{group.label}</h3>
              <p className="text-xs text-gray-500">{group.desc}</p>
            </div>
            <span className="text-xs text-gray-400">{group.assets.length} archivo(s)</span>
          </div>

          {group.assets.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {group.assets.map((asset: any) => (
                <div key={asset.id} className="relative rounded-lg border border-gray-700 overflow-hidden group">
                  {asset.url.startsWith('data:') ? (
                    <img src={asset.url} alt={asset.title} className="w-full h-24 object-cover" />
                  ) : (
                    <img src={asset.url} alt={asset.title} className="w-full h-24 object-cover" />
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button onClick={() => handleDelete(asset.id)} className="text-xs text-red-400 bg-gray-900 rounded px-2 py-1">
                      🗑️ Eliminar
                    </button>
                  </div>
                  <p className="px-2 py-1 text-[10px] text-gray-400 truncate">{asset.title}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 text-center py-4">Sin material. Sube una imagen arriba seleccionando "{group.label}".</p>
          )}
        </div>
      ))}
    </div>
  );
}
