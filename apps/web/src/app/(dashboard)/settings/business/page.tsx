'use client';

import { useState, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

export default function BusinessSettingsPage() {
  const { data: current, loading } = useApi<any>('/ai/config');
  const [form, setForm] = useState({
    businessName: '',
    phone: '',
    email: '',
    address: '',
    instagram: '',
    facebook: '',
    tiktok: '',
    website: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (current?.businessData) {
      setForm({ ...form, ...current.businessData });
    }
  }, [current]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch('/ai/config', { businessData: form });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-gray-400 text-center">Cargando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Datos del negocio</h1>
        <p className="text-sm text-gray-400">Información pública de tu negocio</p>
      </div>

      <div className="rounded-xl border border-card-border bg-card p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre del negocio</label>
          <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="Mi Negocio" className="vspro-input w-full" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Teléfono</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+52 984 123 4567" className="vspro-input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contacto@minegocio.com" className="vspro-input w-full" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Dirección</label>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Calle, Colonia, Ciudad" className="vspro-input w-full" />
        </div>

        <div className="border-t border-gray-700 pt-4">
          <label className="block text-sm font-medium text-gray-300 mb-3">Redes sociales</label>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg w-6">📸</span>
              <input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@minegocio" className="vspro-input flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg w-6">📘</span>
              <input value={form.facebook} onChange={(e) => setForm({ ...form, facebook: e.target.value })} placeholder="facebook.com/minegocio" className="vspro-input flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg w-6">🎵</span>
              <input value={form.tiktok} onChange={(e) => setForm({ ...form, tiktok: e.target.value })} placeholder="@minegocio" className="vspro-input flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg w-6">🌐</span>
              <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="www.minegocio.com" className="vspro-input flex-1" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="vspro-btn-primary disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar datos'}
          </button>
          {saved && <span className="text-sm text-green-400">✓ Guardado</span>}
        </div>
      </div>
    </div>
  );
}
