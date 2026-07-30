'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function GuestsPage() {
  const [guests, setGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadGuests();
  }, []);

  const loadGuests = async () => {
    setLoading(true);
    try {
      // Get unique guests from reservations
      const reservations = await api.get('/reservations');
      const guestMap = new Map<string, any>();

      for (const r of reservations) {
        const key = r.guestName?.toLowerCase() ?? '';
        if (key === 'bloqueado' || !key) continue;

        if (guestMap.has(key)) {
          const existing = guestMap.get(key);
          existing.stays++;
          existing.totalSpent += parseFloat(r.totalPrice) || 0;
          existing.totalNights += r.nights ?? 0;
          if (new Date(r.checkOut) > new Date(existing.lastStay)) {
            existing.lastStay = r.checkOut;
          }
          existing.reservations.push(r);
        } else {
          guestMap.set(key, {
            name: r.guestName,
            phone: r.guestPhone ?? '',
            stays: 1,
            totalSpent: parseFloat(r.totalPrice) || 0,
            totalNights: r.nights ?? 0,
            lastStay: r.checkOut,
            firstStay: r.checkIn,
            reservations: [r],
          });
        }
      }

      const sorted = Array.from(guestMap.values()).sort(
        (a, b) => new Date(b.lastStay).getTime() - new Date(a.lastStay).getTime(),
      );
      setGuests(sorted);
    } catch {}
    setLoading(false);
  };

  const filtered = guests.filter(
    (g) => g.name.toLowerCase().includes(search.toLowerCase()) || g.phone.includes(search),
  );

  if (loading) return <div className="p-6 text-gray-400">Cargando huéspedes...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🧳 Huéspedes</h1>
          <p className="text-sm text-gray-400">{guests.length} huéspedes registrados</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-2xl font-bold text-white">{guests.length}</p>
          <p className="text-xs text-gray-400">Total huéspedes</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-2xl font-bold text-blue-400">
            {guests.filter((g) => g.stays > 1).length}
          </p>
          <p className="text-xs text-gray-400">Repetidores</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-2xl font-bold text-green-400">
            ${guests.reduce((sum, g) => sum + g.totalSpent, 0).toLocaleString('es-MX')}
          </p>
          <p className="text-xs text-gray-400">Revenue total</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-2xl font-bold text-purple-400">
            {guests.reduce((sum, g) => sum + g.totalNights, 0)}
          </p>
          <p className="text-xs text-gray-400">Noches vendidas</p>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar huésped por nombre o teléfono..."
        className="w-full max-w-md rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Guest list */}
      <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Huésped</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Estadías</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Noches</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Revenue</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">
                Última visita
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {filtered.map((g, i) => (
              <tr key={i} className="hover:bg-gray-750">
                <td className="px-4 py-3">
                  <p className="text-white font-medium">{g.name}</p>
                  {g.phone && <p className="text-xs text-gray-500">{g.phone}</p>}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-sm font-medium ${g.stays > 1 ? 'text-blue-400' : 'text-gray-300'}`}
                  >
                    {g.stays} {g.stays > 1 ? '⭐' : ''}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-300">{g.totalNights}</td>
                <td className="px-4 py-3 text-green-400 font-medium">
                  ${g.totalSpent.toLocaleString('es-MX')}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(g.lastStay).toLocaleDateString('es-MX', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            {search ? 'Sin resultados' : 'Sin huéspedes aún'}
          </p>
        )}
      </div>
    </div>
  );
}
