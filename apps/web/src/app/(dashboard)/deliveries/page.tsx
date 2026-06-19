'use client';

import { useState } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { TableSkeleton } from '@/components/ui/skeleton';

const statusColors: Record<string, string> = {
  available: 'bg-green-900/40 text-green-300',
  busy: 'bg-yellow-900/40 text-yellow-300',
  offline: 'bg-gray-700/40 text-gray-400',
};

const assignmentColors: Record<string, string> = {
  offered: 'bg-blue-900/40 text-blue-300',
  accepted: 'bg-green-900/40 text-green-300',
  picked_up: 'bg-orange-900/40 text-orange-300',
  delivered: 'bg-gray-700/40 text-gray-300',
  rejected: 'bg-red-900/40 text-red-300',
};

const assignmentLabels: Record<string, string> = {
  offered: 'Ofrecido',
  accepted: 'Aceptado',
  picked_up: 'Recogido',
  delivered: 'Entregado',
  rejected: 'Rechazado',
};

type Tab = 'active' | 'drivers' | 'history';

export default function DeliveriesPage() {
  const [tab, setTab] = useState<Tab>('active');
  const { data: drivers, loading: loadingDrivers, refetch: refetchDrivers } = useApi<any[]>('/delivery/drivers');
  const { data: active, loading: loadingActive, refetch: refetchActive } = useApi<any[]>('/delivery/active');
  const { data: history, loading: loadingHistory } = useApi<any[]>('/delivery/history');

  const [showAddDriver, setShowAddDriver] = useState(false);
  const [driverForm, setDriverForm] = useState({ name: '', phone: '', vehicleType: 'moto' });
  const [saving, setSaving] = useState(false);

  const handleAddDriver = async () => {
    setSaving(true);
    try {
      await api.post('/delivery/drivers', driverForm);
      setDriverForm({ name: '', phone: '', vehicleType: 'moto' });
      setShowAddDriver(false);
      refetchDrivers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (driverId: string, status: string) => {
    try {
      await api.patch(`/delivery/drivers/${driverId}/status`, { status });
      refetchDrivers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteDriver = async (driverId: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name}?`)) return;
    try {
      await api.delete(`/delivery/drivers/${driverId}`);
      refetchDrivers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Entregas</h1>
          <p className="text-sm text-gray-400">Gestiona repartidores y entregas activas</p>
        </div>
        <button
          onClick={() => setShowAddDriver(!showAddDriver)}
          className="vspro-btn-primary text-sm"
        >
          {showAddDriver ? 'Cancelar' : '+ Nuevo repartidor'}
        </button>
      </div>

      {/* Add Driver Form */}
      {showAddDriver && (
        <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Registrar repartidor</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={driverForm.name}
              onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })}
              placeholder="Nombre"
              className="vspro-input"
            />
            <input
              value={driverForm.phone}
              onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })}
              placeholder="Teléfono (ej: 529841234567)"
              className="vspro-input"
            />
            <select
              value={driverForm.vehicleType}
              onChange={(e) => setDriverForm({ ...driverForm, vehicleType: e.target.value })}
              className="vspro-input"
            >
              <option value="moto">🏍️ Moto</option>
              <option value="bicicleta">🚲 Bicicleta</option>
              <option value="auto">🚗 Auto</option>
              <option value="a_pie">🚶 A pie</option>
            </select>
          </div>
          <button
            onClick={handleAddDriver}
            disabled={saving || !driverForm.name || !driverForm.phone}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Registrar'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-800 p-1">
        {([
          { key: 'active', label: '🚀 Entregas activas' },
          { key: 'drivers', label: '👥 Repartidores' },
          { key: 'history', label: '📋 Historial' },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-accent text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active Deliveries */}
      {tab === 'active' && (
        <div className="rounded-xl border border-card-border bg-card overflow-hidden">
          {loadingActive ? (
            <TableSkeleton rows={4} cols={5} />
          ) : active && active.length > 0 ? (
            <div className="divide-y divide-gray-700">
              {active.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-lg">
                      🛵
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">{a.orderNumber}</p>
                      <p className="text-xs text-gray-400">{a.driverName} → {a.customerName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${assignmentColors[a.status] ?? ''}`}>
                      {assignmentLabels[a.status] ?? a.status}
                    </span>
                    <span className="text-sm text-gray-400">
                      ${Number(a.total).toLocaleString('es-MX')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">No hay entregas activas</div>
          )}
        </div>
      )}

      {/* Drivers */}
      {tab === 'drivers' && (
        <div className="rounded-xl border border-card-border bg-card overflow-hidden">
          {loadingDrivers ? (
            <TableSkeleton rows={4} cols={4} />
          ) : drivers && drivers.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-700">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-gray-400">Repartidor</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-400">Vehículo</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-400">Estado</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-400">Entregas activas</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {drivers.map((d: any) => (
                  <tr key={d.id} className="hover:bg-gray-800/30">
                    <td className="px-5 py-3">
                      <p className="text-white font-medium">{d.name}</p>
                      <p className="text-xs text-gray-500">{d.phone}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-300 capitalize">
                      {d.vehicleType === 'moto' ? '🏍️' : d.vehicleType === 'bicicleta' ? '🚲' : d.vehicleType === 'auto' ? '🚗' : '🚶'} {d.vehicleType}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={d.status}
                        onChange={(e) => handleStatusChange(d.id, e.target.value)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium border-0 cursor-pointer ${statusColors[d.status] ?? ''}`}
                      >
                        <option value="available">Disponible</option>
                        <option value="busy">Ocupado</option>
                        <option value="offline">Offline</option>
                      </select>
                    </td>
                    <td className="px-5 py-3 text-gray-300">
                      {d.activeDeliveries ?? 0} / {d.maxDeliveries ?? 3}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleDeleteDriver(d.id, d.name)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <p>No hay repartidores registrados</p>
              <button onClick={() => setShowAddDriver(true)} className="mt-2 text-accent text-sm hover:underline">
                + Registrar primer repartidor
              </button>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="rounded-xl border border-card-border bg-card overflow-hidden">
          {loadingHistory ? (
            <TableSkeleton rows={6} cols={5} />
          ) : history && history.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-700">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-gray-400">Pedido</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-400">Repartidor</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-400">Estado</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-400">Tiempo</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-400">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {history.map((h: any) => (
                  <tr key={h.id} className="hover:bg-gray-800/30">
                    <td className="px-5 py-3 text-white font-medium">{h.orderNumber}</td>
                    <td className="px-5 py-3 text-gray-300">{h.driverName}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${assignmentColors[h.status] ?? ''}`}>
                        {assignmentLabels[h.status] ?? h.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-400">
                      {h.deliveredAt && h.offeredAt
                        ? `${Math.round((new Date(h.deliveredAt).getTime() - new Date(h.offeredAt).getTime()) / 60000)} min`
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {new Date(h.offeredAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-gray-500">Sin historial de entregas</div>
          )}
        </div>
      )}
    </div>
  );
}
