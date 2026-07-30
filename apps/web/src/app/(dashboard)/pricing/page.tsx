'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function PricingPage() {
  const [pricing, setPricing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    pricePerNight: 0,
    pricePerWeek: 0,
    pricePerMonth: 0,
    dateFrom: '',
    dateTo: '',
    label: '',
    minNights: 1,
    cleaningFee: 0,
  });

  useEffect(() => {
    loadPricing();
  }, []);

  const loadPricing = async () => {
    setLoading(true);
    try {
      const data = await api.get('/reservations/pricing');
      setPricing(data);
    } catch {}
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/reservations/pricing', form);
      setShowForm(false);
      setForm({
        pricePerNight: 0,
        pricePerWeek: 0,
        pricePerMonth: 0,
        dateFrom: '',
        dateTo: '',
        label: '',
        minNights: 1,
        cleaningFee: 0,
      });
      loadPricing();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta regla de precio?')) return;
    await api.delete(`/reservations/pricing/${id}`);
    loadPricing();
  };

  const basePrice = pricing.find((p) => p.isDefault);
  const seasons = pricing.filter((p) => !p.isDefault);

  if (loading) return <div className="p-6 text-gray-400">Cargando precios...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">💲 Precios y Temporadas</h1>
          <p className="text-sm text-gray-400">Configura tarifas base y por temporada</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Nueva temporada
        </button>
      </div>

      {/* Base price card */}
      {basePrice ? (
        <div className="rounded-xl border-2 border-blue-600 bg-blue-900/10 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-300 font-medium uppercase">Precio base</p>
              <p className="text-3xl font-bold text-white mt-1">
                ${parseFloat(basePrice.pricePerNight).toLocaleString('es-MX')}
                <span className="text-sm text-gray-400 font-normal">/noche</span>
              </p>
              <div className="flex gap-4 mt-2">
                {basePrice.pricePerWeek && (
                  <p className="text-sm text-blue-300">
                    ${parseFloat(basePrice.pricePerWeek).toLocaleString('es-MX')}/semana
                  </p>
                )}
                {basePrice.pricePerMonth && (
                  <p className="text-sm text-green-300">
                    ${parseFloat(basePrice.pricePerMonth).toLocaleString('es-MX')}/mes
                  </p>
                )}
              </div>
              {basePrice.minNights > 1 && (
                <p className="text-xs text-gray-400 mt-1">Mínimo {basePrice.minNights} noches</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Se aplica cuando no hay temporada activa</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-yellow-600 bg-yellow-900/10 p-6 text-center">
          <p className="text-yellow-300">No tienes precio base configurado.</p>
          <p className="text-xs text-gray-400 mt-1">
            Crea una regla de precio sin fechas para definir tu tarifa base.
          </p>
        </div>
      )}

      {/* Season prices */}
      {seasons.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Temporadas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {seasons.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{p.label || 'Temporada'}</p>
                    <p className="text-lg font-bold text-green-400 mt-1">
                      ${parseFloat(p.pricePerNight).toLocaleString('es-MX')}/noche
                    </p>
                    {p.pricePerWeek > 0 && (
                      <p className="text-xs text-blue-300">
                        ${parseFloat(p.pricePerWeek).toLocaleString('es-MX')}/sem
                      </p>
                    )}
                    {p.pricePerMonth > 0 && (
                      <p className="text-xs text-purple-300">
                        ${parseFloat(p.pricePerMonth).toLocaleString('es-MX')}/mes
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(p.dateFrom).toLocaleDateString('es-MX', {
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      —{' '}
                      {new Date(p.dateTo).toLocaleDateString('es-MX', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    {p.minNights > 1 && (
                      <p className="text-xs text-gray-500">Min {p.minNights} noches</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Cómo funciona</h3>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>• El agente IA usa estas tarifas para cotizar automáticamente por WhatsApp</li>
          <li>• Si hay una temporada activa para las fechas solicitadas, usa ese precio</li>
          <li>• Si no hay temporada, usa el precio base</li>
          <li>• Precio por semana/mes aplica cuando el huésped reserva 7+ o 30+ noches</li>
        </ul>
      </div>

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-gray-800 border border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Nueva regla de precio</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400">Etiqueta</label>
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Ej: Temporada alta, Navidad, Semana Santa"
                  className="w-full vspro-input"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Precio por noche (MXN)*</label>
                <input
                  type="number"
                  value={form.pricePerNight || ''}
                  onChange={(e) =>
                    setForm({ ...form, pricePerNight: parseFloat(e.target.value) || 0 })
                  }
                  required
                  min={0}
                  className="w-full vspro-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Precio por semana</label>
                  <input
                    type="number"
                    value={form.pricePerWeek || ''}
                    onChange={(e) =>
                      setForm({ ...form, pricePerWeek: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full vspro-input"
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Precio por mes</label>
                  <input
                    type="number"
                    value={form.pricePerMonth || ''}
                    onChange={(e) =>
                      setForm({ ...form, pricePerMonth: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full vspro-input"
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Desde (vacío = precio base)</label>
                  <input
                    type="date"
                    value={form.dateFrom}
                    onChange={(e) => setForm({ ...form, dateFrom: e.target.value })}
                    className="w-full vspro-input"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Hasta</label>
                  <input
                    type="date"
                    value={form.dateTo}
                    onChange={(e) => setForm({ ...form, dateTo: e.target.value })}
                    className="w-full vspro-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Noches mínimas</label>
                  <input
                    type="number"
                    value={form.minNights}
                    onChange={(e) => setForm({ ...form, minNights: parseInt(e.target.value) || 1 })}
                    min={1}
                    className="w-full vspro-input"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Tarifa limpieza</label>
                  <input
                    type="number"
                    value={form.cleaningFee || ''}
                    onChange={(e) =>
                      setForm({ ...form, cleaningFee: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full vspro-input"
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 rounded-lg border border-gray-600 py-2 text-sm text-gray-300 hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
