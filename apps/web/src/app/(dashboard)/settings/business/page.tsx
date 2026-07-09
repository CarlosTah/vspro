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
    lat: '',
    lng: '',
    instagram: '',
    facebook: '',
    tiktok: '',
    website: '',
    industry: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [locating, setLocating] = useState(false);

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

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm({ ...form, lat: pos.coords.latitude.toString(), lng: pos.coords.longitude.toString() });
        setLocating(false);
      },
      () => {
        alert('No se pudo obtener la ubicación. Verifica los permisos del navegador.');
        setLocating(false);
      },
      { enableHighAccuracy: true },
    );
  };

  if (loading) return <div className="p-8 text-gray-400 text-center">Cargando...</div>;

  const hasLocation = form.lat && form.lng;
  const mapsUrl = hasLocation ? `https://maps.google.com/?q=${form.lat},${form.lng}` : '';
  const mapsEmbed = hasLocation
    ? `https://maps.google.com/maps?q=${form.lat},${form.lng}&z=16&output=embed`
    : '';

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

          {/* Industry */}
          <div className="space-y-2">
            <label className="text-sm text-gray-300">Tipo de negocio</label>
            <select
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              className="vspro-input"
            >
              <option value="">Selecciona...</option>
              <option value="restaurante">🍽️ Restaurante / Comida</option>
              <option value="barberia">💈 Barbería / Estética</option>
              <option value="ropa">👕 Ropa / Ecommerce</option>
              <option value="clinica">🏥 Clínica / Salud</option>
              <option value="inmobiliaria">🏠 Inmobiliaria / Rentas</option>
              <option value="taller">🔧 Taller / Servicios</option>
              <option value="ecommerce">🛒 Tienda Online</option>
            </select>
            <p className="text-xs text-gray-500">Define el flujo del agente IA y las opciones del dashboard</p>
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

        {/* Location picker */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Ubicación en mapa</label>
          <div className="flex gap-2 mb-2">
            <button
              onClick={handleGetLocation}
              disabled={locating}
              className="rounded-lg border border-blue-600 px-3 py-2 text-xs text-blue-400 hover:bg-blue-900/30 disabled:opacity-50"
            >
              {locating ? '📍 Obteniendo...' : '📍 Usar mi ubicación actual'}
            </button>
            {hasLocation && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gray-600 px-3 py-2 text-xs text-gray-300 hover:text-white">
                🗺️ Ver en Google Maps
              </a>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              value={form.lat}
              onChange={(e) => setForm({ ...form, lat: e.target.value })}
              placeholder="Latitud (ej: 20.9674)"
              className="vspro-input w-full text-xs"
            />
            <input
              value={form.lng}
              onChange={(e) => setForm({ ...form, lng: e.target.value })}
              placeholder="Longitud (ej: -89.6237)"
              className="vspro-input w-full text-xs"
            />
          </div>
          {hasLocation && (
            <div className="rounded-lg overflow-hidden border border-gray-700">
              <iframe
                src={mapsEmbed}
                width="100%"
                height="200"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}
          {!hasLocation && (
            <p className="text-xs text-gray-500">Haz clic en "Usar mi ubicación" o ingresa las coordenadas manualmente. Los clientes podrán ver tu ubicación cuando pregunten.</p>
          )}
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
