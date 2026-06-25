'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

type Tab = 'calendar' | 'list' | 'pricing';

export default function ReservationsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [reservations, setReservations] = useState<any[]>([]);
  const [pricing, setPricing] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('calendar');
  const [showNewReservation, setShowNewReservation] = useState(false);
  const [showNewPrice, setShowNewPrice] = useState(false);
  const [saving, setSaving] = useState(false);

  // New reservation form
  const [form, setForm] = useState({ guestName: '', guestPhone: '', checkIn: '', checkOut: '', guests: 1, notes: '' });
  // New pricing form
  const [priceForm, setPriceForm] = useState({ pricePerNight: 0, dateFrom: '', dateTo: '', label: '', minNights: 1 });

  useEffect(() => { loadData(); }, [year, month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cal, list, rules] = await Promise.all([
        api.get(`/reservations/calendar?year=${year}&month=${month}`),
        api.get('/reservations'),
        api.get('/reservations/pricing'),
      ]);
      setReservations(list);
      setPricing(rules);
    } catch {}
    setLoading(false);
  };

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/reservations', form);
      setShowNewReservation(false);
      setForm({ guestName: '', guestPhone: '', checkIn: '', checkOut: '', guests: 1, notes: '' });
      loadData();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleCreatePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/reservations/pricing', priceForm);
      setShowNewPrice(false);
      setPriceForm({ pricePerNight: 0, dateFrom: '', dateTo: '', label: '', minNights: 1 });
      loadData();
    } catch (err: any) { alert(err.message); }
    finally { setSaving(false); }
  };

  const handleCancelReservation = async (id: string) => {
    if (!confirm('¿Cancelar esta reserva?')) return;
    await api.patch(`/reservations/${id}/status`, { status: 'cancelled' });
    loadData();
  };

  const handleDeletePrice = async (id: string) => {
    await api.delete(`/reservations/pricing/${id}`);
    loadData();
  };

  // Calendar generation
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getReservationsForDay = (day: number) => {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return reservations.filter(r => {
      const ci = r.checkIn?.split('T')[0] ?? r.checkIn;
      const co = r.checkOut?.split('T')[0] ?? r.checkOut;
      return r.status !== 'cancelled' && ci <= date && co > date;
    });
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };

  const statusColors: Record<string, string> = {
    confirmed: 'bg-green-900/40 text-green-300',
    pending: 'bg-yellow-900/40 text-yellow-300',
    cancelled: 'bg-red-900/40 text-red-300',
    completed: 'bg-blue-900/40 text-blue-300',
  };

  if (loading) return <div className="p-6 text-gray-400">Cargando...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">📅 Reservaciones</h1>
          <p className="text-sm text-gray-400">{reservations.filter(r => r.status === 'confirmed').length} reservas activas</p>
        </div>
        <button onClick={() => setShowNewReservation(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          + Nueva reserva
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-800 p-1 w-fit">
        {([{ key: 'calendar', label: '📅 Calendario' }, { key: 'list', label: '📋 Lista' }, { key: 'pricing', label: '💰 Precios' }] as { key: Tab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Calendar Tab */}
      {tab === 'calendar' && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="text-gray-400 hover:text-white text-lg">←</button>
            <h2 className="text-lg font-semibold text-white">{MONTHS[month - 1]} {year}</h2>
            <button onClick={nextMonth} className="text-gray-400 hover:text-white text-lg">→</button>
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map(d => <div key={d} className="text-center text-xs text-gray-500 py-1">{d}</div>)}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
            {calendarDays.map(day => {
              const dayReservations = getReservationsForDay(day);
              const isToday = day === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear();
              const isBooked = dayReservations.length > 0;

              return (
                <div
                  key={day}
                  className={`relative min-h-[60px] rounded-lg border p-1 text-xs ${
                    isBooked ? 'border-green-700 bg-green-900/20' : 'border-gray-700 bg-gray-900/50'
                  } ${isToday ? 'ring-2 ring-blue-500' : ''}`}
                >
                  <span className={`font-medium ${isToday ? 'text-blue-400' : 'text-gray-300'}`}>{day}</span>
                  {dayReservations.map((r, i) => (
                    <div key={i} className="mt-0.5 truncate rounded bg-green-800/60 px-1 text-[10px] text-green-200">
                      {r.guestName}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List Tab */}
      {tab === 'list' && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Huésped</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Check-in</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Check-out</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Noches</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {reservations.map(r => (
                <tr key={r.id} className="hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{r.guestName}</p>
                    <p className="text-xs text-gray-500">{r.guestPhone ?? ''}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{new Date(r.checkIn).toLocaleDateString('es-MX')}</td>
                  <td className="px-4 py-3 text-gray-300">{new Date(r.checkOut).toLocaleDateString('es-MX')}</td>
                  <td className="px-4 py-3 text-white font-medium">{r.nights}</td>
                  <td className="px-4 py-3 text-green-400 font-medium">${parseFloat(r.totalPrice).toLocaleString('es-MX')}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${statusColors[r.status] ?? ''}`}>{r.status}</span></td>
                  <td className="px-4 py-3">
                    {r.status === 'confirmed' && (
                      <button onClick={() => handleCancelReservation(r.id)} className="text-xs text-red-400 hover:text-red-300">Cancelar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {reservations.length === 0 && <p className="text-center text-gray-500 py-8">Sin reservaciones</p>}
        </div>
      )}

      {/* Pricing Tab */}
      {tab === 'pricing' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowNewPrice(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
              + Nueva regla de precio
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pricing.map(p => (
              <div key={p.id} className={`rounded-xl border p-4 ${p.isDefault ? 'border-blue-600 bg-blue-900/10' : 'border-gray-700 bg-gray-800'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-semibold">${parseFloat(p.pricePerNight).toLocaleString('es-MX')}/noche</p>
                    <p className="text-xs text-gray-400">{p.isDefault ? 'Precio base' : p.label ?? `${p.dateFrom} → ${p.dateTo}`}</p>
                    {p.minNights > 1 && <p className="text-xs text-gray-500">Mínimo {p.minNights} noches</p>}
                  </div>
                  {!p.isDefault && (
                    <button onClick={() => handleDeletePrice(p.id)} className="text-xs text-red-400 hover:text-red-300">✕</button>
                  )}
                </div>
              </div>
            ))}
            {pricing.length === 0 && <p className="text-gray-500 text-sm col-span-2">Sin reglas de precio. Agrega una para que el agente pueda cotizar.</p>}
          </div>
        </div>
      )}

      {/* New Reservation Modal */}
      {showNewReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-gray-800 border border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Nueva reserva</h2>
            <form onSubmit={handleCreateReservation} className="space-y-3">
              <input value={form.guestName} onChange={e => setForm({ ...form, guestName: e.target.value })} placeholder="Nombre del huésped" required className="w-full vspro-input" />
              <input value={form.guestPhone} onChange={e => setForm({ ...form, guestPhone: e.target.value })} placeholder="Teléfono" className="w-full vspro-input" />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-400">Check-in</label><input type="date" value={form.checkIn} onChange={e => setForm({ ...form, checkIn: e.target.value })} required className="w-full vspro-input" /></div>
                <div><label className="text-xs text-gray-400">Check-out</label><input type="date" value={form.checkOut} onChange={e => setForm({ ...form, checkOut: e.target.value })} required className="w-full vspro-input" /></div>
              </div>
              <input type="number" value={form.guests} onChange={e => setForm({ ...form, guests: parseInt(e.target.value) || 1 })} min={1} placeholder="Huéspedes" className="w-full vspro-input" />
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notas (hora llegada, etc.)" rows={2} className="w-full vspro-input resize-none" />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNewReservation(false)} className="flex-1 rounded-lg border border-gray-600 py-2 text-sm text-gray-300 hover:bg-gray-700">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Guardando...' : 'Reservar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Price Modal */}
      {showNewPrice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-gray-800 border border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Nueva regla de precio</h2>
            <form onSubmit={handleCreatePrice} className="space-y-3">
              <div><label className="text-xs text-gray-400">Precio por noche (MXN)</label><input type="number" value={priceForm.pricePerNight} onChange={e => setPriceForm({ ...priceForm, pricePerNight: parseFloat(e.target.value) || 0 })} required min={0} className="w-full vspro-input" /></div>
              <input value={priceForm.label} onChange={e => setPriceForm({ ...priceForm, label: e.target.value })} placeholder="Etiqueta (ej: Temporada alta, Navidad)" className="w-full vspro-input" />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-400">Desde (vacío = precio base)</label><input type="date" value={priceForm.dateFrom} onChange={e => setPriceForm({ ...priceForm, dateFrom: e.target.value })} className="w-full vspro-input" /></div>
                <div><label className="text-xs text-gray-400">Hasta</label><input type="date" value={priceForm.dateTo} onChange={e => setPriceForm({ ...priceForm, dateTo: e.target.value })} className="w-full vspro-input" /></div>
              </div>
              <div><label className="text-xs text-gray-400">Noches mínimas</label><input type="number" value={priceForm.minNights} onChange={e => setPriceForm({ ...priceForm, minNights: parseInt(e.target.value) || 1 })} min={1} className="w-full vspro-input" /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNewPrice(false)} className="flex-1 rounded-lg border border-gray-600 py-2 text-sm text-gray-300 hover:bg-gray-700">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
