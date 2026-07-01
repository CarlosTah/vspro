'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

const AMENITIES_OPTIONS = [
  'WiFi', 'Aire acondicionado', 'Cocina', 'Lavadora', 'Estacionamiento',
  'Alberca', 'TV', 'Terraza', 'Vista al mar', 'Jacuzzi',
  'Gym', 'Mascotas permitidas', 'Parrilla', 'Seguridad 24h',
];

export default function PropertiesPage() {
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', description: '', address: '', capacity: 2, bedrooms: 1, bathrooms: 1,
    amenities: [] as string[], rules: [] as string[], images: [] as string[],
    pricePerNight: 0, pricePerWeek: 0, pricePerMonth: 0, minNights: 1, lat: 0, lng: 0,
  });
  const [newRule, setNewRule] = useState('');

  useEffect(() => { loadProperties(); }, []);

  const loadProperties = async () => {
    try {
      const data = await api.get('/properties-rental');
      setProperties(data);
    } catch { setProperties([]); }
    setLoading(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', address: '', capacity: 2, bedrooms: 1, bathrooms: 1, amenities: [], rules: [], images: [], pricePerNight: 0, pricePerWeek: 0, pricePerMonth: 0, minNights: 1, lat: 0, lng: 0 });
    setShowForm(true);
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({
      name: p.name ?? '', description: p.description ?? '', address: p.address ?? '',
      capacity: p.capacity ?? 2, bedrooms: p.bedrooms ?? 1, bathrooms: p.bathrooms ?? 1,
      amenities: p.amenities ?? [], rules: p.rules ?? [], images: p.images ?? [],
      pricePerNight: parseFloat(p.pricePerNight) || 0, pricePerWeek: parseFloat(p.pricePerWeek) || 0,
      pricePerMonth: parseFloat(p.pricePerMonth) || 0, minNights: p.minNights ?? 1,
      lat: parseFloat(p.lat) || 0, lng: parseFloat(p.lng) || 0,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/properties-rental/${editing.id}`, form);
      } else {
        await api.post('/properties-rental', form);
      }
      setShowForm(false);
      loadProperties();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta propiedad?')) return;
    await api.delete(`/properties-rental/${id}`);
    loadProperties();
  };

  const toggleAmenity = (amenity: string) => {
    setForm({
      ...form,
      amenities: form.amenities.includes(amenity)
        ? form.amenities.filter(a => a !== amenity)
        : [...form.amenities, amenity],
    });
  };

  const addRule = () => {
    if (!newRule.trim()) return;
    setForm({ ...form, rules: [...form.rules, newRule.trim()] });
    setNewRule('');
  };

  const handleGetLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm({ ...form, lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => alert('No se pudo obtener ubicación'),
      { enableHighAccuracy: true },
    );
  };

  if (loading) return <div className="p-6 text-gray-400">Cargando...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🏠 Propiedades</h1>
          <p className="text-sm text-gray-400">{properties.length} propiedad(es) registrada(s)</p>
        </div>
        <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Nueva propiedad
        </button>
      </div>

      {/* Property cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {properties.map(p => (
          <div key={p.id} className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
            {/* Image placeholder */}
            <div className="h-40 bg-gray-900 flex items-center justify-center">
              {p.images?.length > 0 ? (
                <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl">🏠</span>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-white font-semibold">{p.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{p.address || 'Sin dirección'}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-400">${parseFloat(p.pricePerNight).toLocaleString('es-MX')}</p>
                  <p className="text-[10px] text-gray-500">/noche</p>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                <span>👥 {p.capacity} huéspedes</span>
                <span>🛏️ {p.bedrooms} hab</span>
                <span>🚿 {p.bathrooms} baños</span>
                {p.minNights > 1 && <span>📅 Mín {p.minNights} noches</span>}
              </div>

              {p.amenities?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.amenities.slice(0, 5).map((a: string) => (
                    <span key={a} className="rounded-full bg-gray-700 px-2 py-0.5 text-[10px] text-gray-300">{a}</span>
                  ))}
                  {p.amenities.length > 5 && <span className="text-[10px] text-gray-500">+{p.amenities.length - 5}</span>}
                </div>
              )}

              {p.pricePerWeek && (
                <p className="text-xs text-blue-300 mt-2">${parseFloat(p.pricePerWeek).toLocaleString('es-MX')}/semana</p>
              )}
              {p.pricePerMonth && (
                <p className="text-xs text-green-300">${parseFloat(p.pricePerMonth).toLocaleString('es-MX')}/mes</p>
              )}

              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                <button onClick={() => openEdit(p)} className="text-xs text-blue-400 hover:text-blue-300">Editar</button>
                <button onClick={() => handleDelete(p.id)} className="text-xs text-red-400 hover:text-red-300">Eliminar</button>
              </div>
            </div>
          </div>
        ))}

        {properties.length === 0 && (
          <div className="col-span-2 text-center py-12 text-gray-500">
            <p className="text-4xl mb-2">🏠</p>
            <p>Sin propiedades. Agrega tu primera propiedad para empezar.</p>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-gray-800 border border-gray-700 p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">{editing ? 'Editar propiedad' : 'Nueva propiedad'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Basic */}
              <div>
                <label className="text-xs text-gray-400">Nombre de la propiedad</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Depto Vista al Mar" className="w-full vspro-input" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Descripción</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Hermoso departamento con vista al mar..." className="w-full vspro-input resize-none" />
              </div>

              {/* Capacity */}
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-gray-400">Huéspedes</label><input type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 1 })} min={1} className="w-full vspro-input" /></div>
                <div><label className="text-xs text-gray-400">Habitaciones</label><input type="number" value={form.bedrooms} onChange={e => setForm({ ...form, bedrooms: parseInt(e.target.value) || 1 })} min={0} className="w-full vspro-input" /></div>
                <div><label className="text-xs text-gray-400">Baños</label><input type="number" value={form.bathrooms} onChange={e => setForm({ ...form, bathrooms: parseInt(e.target.value) || 1 })} min={0} className="w-full vspro-input" /></div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-gray-400">$/noche</label><input type="number" value={form.pricePerNight} onChange={e => setForm({ ...form, pricePerNight: parseFloat(e.target.value) || 0 })} min={0} className="w-full vspro-input" /></div>
                <div><label className="text-xs text-gray-400">$/semana</label><input type="number" value={form.pricePerWeek} onChange={e => setForm({ ...form, pricePerWeek: parseFloat(e.target.value) || 0 })} min={0} className="w-full vspro-input" placeholder="Opcional" /></div>
                <div><label className="text-xs text-gray-400">$/mes</label><input type="number" value={form.pricePerMonth} onChange={e => setForm({ ...form, pricePerMonth: parseFloat(e.target.value) || 0 })} min={0} className="w-full vspro-input" placeholder="Opcional" /></div>
              </div>
              <div className="w-1/3">
                <label className="text-xs text-gray-400">Noches mínimas</label>
                <input type="number" value={form.minNights} onChange={e => setForm({ ...form, minNights: parseInt(e.target.value) || 1 })} min={1} className="w-full vspro-input" />
              </div>

              {/* Location */}
              <div>
                <label className="text-xs text-gray-400">Dirección</label>
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Av. Costera #123, Cancún" className="w-full vspro-input" />
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input type="number" step="any" value={form.lat || ''} onChange={e => setForm({ ...form, lat: parseFloat(e.target.value) || 0 })} placeholder="Latitud" className="vspro-input text-xs" />
                  <input type="number" step="any" value={form.lng || ''} onChange={e => setForm({ ...form, lng: parseFloat(e.target.value) || 0 })} placeholder="Longitud" className="vspro-input text-xs" />
                </div>
                <button type="button" onClick={handleGetLocation} className="rounded-lg border border-blue-600 px-3 py-2 text-xs text-blue-400 hover:bg-blue-900/30">📍 Mi ubicación</button>
              </div>
              {form.lat && form.lng ? (
                <iframe src={`https://maps.google.com/maps?q=${form.lat},${form.lng}&z=16&output=embed`} width="100%" height="150" className="rounded-lg border border-gray-700" loading="lazy" />
              ) : null}

              {/* Amenities */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Amenidades</label>
                <div className="flex flex-wrap gap-2">
                  {AMENITIES_OPTIONS.map(a => (
                    <button key={a} type="button" onClick={() => toggleAmenity(a)}
                      className={`rounded-full px-3 py-1 text-xs transition-colors ${form.amenities.includes(a) ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                    >{a}</button>
                  ))}
                </div>
              </div>

              {/* Rules */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Reglas de la casa</label>
                <div className="flex gap-2 mb-2">
                  <input value={newRule} onChange={e => setNewRule(e.target.value)} placeholder="Ej: No fumar, No fiestas..." className="flex-1 vspro-input text-xs" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRule())} />
                  <button type="button" onClick={addRule} className="rounded-lg bg-gray-700 px-3 text-xs text-gray-300 hover:bg-gray-600">+</button>
                </div>
                {form.rules.length > 0 && (
                  <div className="space-y-1">
                    {form.rules.map((r, i) => (
                      <div key={i} className="flex items-center justify-between bg-gray-900 rounded-lg px-3 py-1.5 text-xs text-gray-300">
                        <span>• {r}</span>
                        <button type="button" onClick={() => setForm({ ...form, rules: form.rules.filter((_, idx) => idx !== i) })} className="text-red-400">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-3 border-t border-gray-700">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-gray-600 py-2.5 text-sm text-gray-300 hover:bg-gray-700">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear propiedad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
