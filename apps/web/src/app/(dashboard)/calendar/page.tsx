'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, [year, month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.get('/reservations');
      setReservations(data);
    } catch {}
    setLoading(false);
  };

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getReservationsForDay = (day: number) => {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return reservations.filter((r) => {
      if (r.status === 'cancelled') return false;
      const ci = (r.checkIn ?? '').split('T')[0];
      const co = (r.checkOut ?? '').split('T')[0];
      return ci <= date && co > date;
    });
  };

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else setMonth(month + 1);
  };

  const selectedReservations = selectedDay ? getReservationsForDay(selectedDay) : [];

  // Occupancy stats
  const bookedDays = new Set<number>();
  reservations
    .filter((r) => r.status !== 'cancelled')
    .forEach((r) => {
      const ci = new Date(r.checkIn);
      const co = new Date(r.checkOut);
      for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
        if (d.getFullYear() === year && d.getMonth() + 1 === month) {
          bookedDays.add(d.getDate());
        }
      }
    });
  const occupancy = Math.round((bookedDays.size / daysInMonth) * 100);

  if (loading) return <div className="p-6 text-gray-400">Cargando calendario...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🗓️ Calendario</h1>
          <p className="text-sm text-gray-400">
            Ocupación {MONTHS[month - 1]}: {occupancy}% ({bookedDays.size}/{daysInMonth} noches)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="inline-block w-3 h-3 rounded bg-green-700" /> Ocupado
            <span className="inline-block w-3 h-3 rounded bg-yellow-700 ml-2" /> Check-in/out
            <span className="inline-block w-3 h-3 rounded bg-gray-700 ml-2" /> Libre
          </div>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800 px-5 py-3">
        <button onClick={prevMonth} className="text-gray-400 hover:text-white text-xl px-2">
          ←
        </button>
        <h2 className="text-lg font-semibold text-white">
          {MONTHS[month - 1]} {year}
        </h2>
        <button onClick={nextMonth} className="text-gray-400 hover:text-white text-xl px-2">
          →
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2 rounded-xl border border-gray-700 bg-gray-800 p-5">
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">
                {d}
              </div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e-${i}`} />
            ))}
            {calendarDays.map((day) => {
              const dayRes = getReservationsForDay(day);
              const isToday =
                day === now.getDate() && month === now.getMonth() + 1 && year === now.getFullYear();
              const isBooked = dayRes.length > 0;
              const isCheckIn = reservations.some((r) => {
                const ci = (r.checkIn ?? '').split('T')[0];
                return (
                  ci ===
                    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` &&
                  r.status !== 'cancelled'
                );
              });
              const isCheckOut = reservations.some((r) => {
                const co = (r.checkOut ?? '').split('T')[0];
                return (
                  co ===
                    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` &&
                  r.status !== 'cancelled'
                );
              });
              const isSelected = selectedDay === day;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                  className={`relative min-h-[70px] rounded-lg border p-1.5 text-left transition-all ${
                    isSelected
                      ? 'ring-2 ring-blue-500 border-blue-500'
                      : isBooked
                        ? 'border-green-700/60 bg-green-900/20 hover:bg-green-900/30'
                        : 'border-gray-700/60 bg-gray-900/30 hover:bg-gray-800'
                  } ${isToday ? 'ring-1 ring-blue-400' : ''}`}
                >
                  <span
                    className={`text-xs font-medium ${isToday ? 'text-blue-400' : isBooked ? 'text-green-300' : 'text-gray-400'}`}
                  >
                    {day}
                  </span>
                  {isCheckIn && <span className="absolute top-1 right-1 text-[9px]">🟢</span>}
                  {isCheckOut && <span className="absolute bottom-1 right-1 text-[9px]">🔴</span>}
                  {dayRes.slice(0, 2).map((r, i) => (
                    <div
                      key={i}
                      className="mt-0.5 truncate rounded bg-green-800/60 px-1 text-[10px] text-green-200"
                    >
                      {r.guestName === 'BLOQUEADO' ? '🔒' : r.guestName?.split(' ')[0]}
                    </div>
                  ))}
                  {dayRes.length > 2 && (
                    <div className="text-[9px] text-gray-500 mt-0.5">+{dayRes.length - 2} más</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          {selectedDay ? (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">
                {selectedDay} de {MONTHS[month - 1]}
              </h3>
              {selectedReservations.length === 0 ? (
                <p className="text-sm text-gray-500">Sin reservas este día. Disponible.</p>
              ) : (
                <div className="space-y-3">
                  {selectedReservations.map((r) => (
                    <div key={r.id} className="rounded-lg border border-gray-600 bg-gray-900 p-3">
                      <p className="text-sm font-medium text-white">
                        {r.guestName === 'BLOQUEADO' ? '🔒 Bloqueado' : r.guestName}
                      </p>
                      {r.guestPhone && <p className="text-xs text-gray-400">{r.guestPhone}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(r.checkIn).toLocaleDateString('es-MX')} →{' '}
                        {new Date(r.checkOut).toLocaleDateString('es-MX')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {r.nights} noches · {r.guests ?? 1} huéspedes
                      </p>
                      {r.totalPrice && (
                        <p className="text-sm text-green-400 font-medium mt-1">
                          ${parseFloat(r.totalPrice).toLocaleString('es-MX')}
                        </p>
                      )}
                      {r.notes && <p className="text-xs text-gray-500 mt-1 italic">{r.notes}</p>}
                      <span
                        className={`inline-block mt-2 rounded-full px-2 py-0.5 text-[10px] ${
                          r.status === 'confirmed'
                            ? 'bg-green-900/40 text-green-300'
                            : r.status === 'pending'
                              ? 'bg-yellow-900/40 text-yellow-300'
                              : 'bg-gray-700 text-gray-300'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">📅</p>
              <p className="text-sm text-gray-500">Selecciona un día para ver detalles</p>
            </div>
          )}

          {/* Upcoming check-ins */}
          <div className="mt-6 pt-4 border-t border-gray-700">
            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">
              Próximos check-ins
            </h4>
            {reservations
              .filter((r) => r.status === 'confirmed' && new Date(r.checkIn) >= now)
              .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime())
              .slice(0, 4)
              .map((r) => (
                <div key={r.id} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="text-gray-300">{r.guestName}</span>
                  <span className="text-gray-500">
                    {new Date(r.checkIn).toLocaleDateString('es-MX', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              ))}
            {reservations.filter((r) => r.status === 'confirmed' && new Date(r.checkIn) >= now)
              .length === 0 && <p className="text-xs text-gray-600">Sin check-ins próximos</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
