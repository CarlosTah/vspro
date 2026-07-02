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

type Tab = 'active' | 'drivers' | 'assignments' | 'history';

export default function DeliveriesPage() {
  const [tab, setTab] = useState<Tab>('active');
  const { data: drivers, loading: loadingDrivers, refetch: refetchDrivers } = useApi<any[]>('/delivery/drivers');
  const { data: active, loading: loadingActive, refetch: refetchActive } = useApi<any[]>('/delivery/active');
  const { data: history, loading: loadingHistory } = useApi<any[]>('/delivery/history');
  const { data: assignments, refetch: refetchAssignments } = useApi<any[]>('/delivery/assignments');

  const [showAddDriver, setShowAddDriver] = useState(false);
  const [driverForm, setDriverForm] = useState({ name: '', phone: '', vehicleType: 'moto', deliveryFee: 0 });
  const [saving, setSaving] = useState(false);
  const [payingDriver, setPayingDriver] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [assignmentMessages, setAssignmentMessages] = useState<any[]>([]);
  const [driverMsg, setDriverMsg] = useState('');

  const loadAssignmentMessages = async (assignment: any) => {
    setSelectedAssignment(assignment);
    try {
      const msgs = await api.get(`/delivery/assignments/${assignment.id}/messages`);
      setAssignmentMessages(msgs);
    } catch { setAssignmentMessages([]); }
  };

  const sendDriverMsg = async () => {
    if (!driverMsg.trim() || !selectedAssignment) return;
    await api.post(`/delivery/assignments/${selectedAssignment.id}/message`, { text: driverMsg });
    setDriverMsg('');
    loadAssignmentMessages(selectedAssignment);
  };

  const handleAddDriver = async () => {
    setSaving(true);
    try {
      await api.post('/delivery/drivers', driverForm);
      setDriverForm({ name: '', phone: '', vehicleType: 'moto', deliveryFee: 0 });
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
          <div>
            <label className="text-xs text-gray-400">Tarifa por envío ($)</label>
            <input
              type="number"
              value={driverForm.deliveryFee}
              onChange={(e) => setDriverForm({ ...driverForm, deliveryFee: parseFloat(e.target.value) || 0 })}
              placeholder="50"
              min={0}
              className="vspro-input"
            />
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
          { key: 'assignments', label: '📨 Asignaciones' },
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
                  <th className="px-5 py-3 text-left font-medium text-gray-400">Tarifa</th>
                  <th className="px-5 py-3 text-left font-medium text-gray-400">Saldo</th>
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
                    <td className="px-5 py-3 text-white font-medium">
                      ${parseFloat(d.deliveryFee ?? 0).toLocaleString('es-MX')}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`font-medium ${parseFloat(d.balance ?? 0) > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
                        ${parseFloat(d.balance ?? 0).toLocaleString('es-MX')}
                      </span>
                      {parseFloat(d.balance ?? 0) > 0 && (
                        <button
                          onClick={() => { setPayingDriver(d.id); setPayAmount(parseFloat(d.balance ?? 0)); }}
                          className="ml-2 text-[10px] text-green-400 hover:text-green-300 border border-green-600 rounded px-1.5 py-0.5"
                        >Pagar</button>
                      )}
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
      {/* Assignments Tab */}
      {tab === 'assignments' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Assignment List */}
          <div className="lg:col-span-2 rounded-xl border border-card-border bg-card overflow-hidden">
            {assignments && assignments.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Pedido</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Repartidor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Timeline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {assignments.map((a: any) => (
                    <tr key={a.id} className={`hover:bg-gray-800/30 cursor-pointer ${selectedAssignment?.id === a.id ? 'bg-blue-900/20' : ''}`}
                        onClick={() => loadAssignmentMessages(a)}>
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">#{a.orderNumber}</p>
                        <p className="text-xs text-gray-500">{a.customerName}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white">{a.driverName ?? 'Sin asignar'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${assignmentColors[a.status] ?? ''}`}>
                          {assignmentLabels[a.status] ?? a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[10px] text-gray-400">
                        {a.offeredAt && <span>📨 {new Date(a.offeredAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} </span>}
                        {a.acceptedAt && <span>✅ {new Date(a.acceptedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} </span>}
                        {a.pickedUpAt && <span>📦 {new Date(a.pickedUpAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} </span>}
                        {a.deliveredAt && <span>🏠 {new Date(a.deliveredAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-gray-500">Sin asignaciones de entrega</div>
            )}
          </div>

          {/* Assignment Detail Panel */}
          <div className="lg:col-span-1">
            {selectedAssignment ? (
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-4 space-y-3 sticky top-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">#{selectedAssignment.orderNumber}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${assignmentColors[selectedAssignment.status]}`}>
                    {assignmentLabels[selectedAssignment.status]}
                  </span>
                </div>

                <div className="text-xs text-gray-400 space-y-1 border-b border-gray-700 pb-3">
                  <p>👤 {selectedAssignment.customerName} · {selectedAssignment.customerPhone}</p>
                  <p>🛵 {selectedAssignment.driverName} · {selectedAssignment.driverPhone}</p>
                  {selectedAssignment.shippingAddress && (
                    <p>📍 {typeof selectedAssignment.shippingAddress === 'object' ? selectedAssignment.shippingAddress.street : selectedAssignment.shippingAddress}</p>
                  )}
                  <p>💰 ${parseFloat(selectedAssignment.orderTotal).toLocaleString('es-MX')}</p>
                </div>

                {/* Messages */}
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {assignmentMessages.map((m: any) => (
                    <div key={m.id} className={`text-xs rounded-lg px-2 py-1.5 ${m.direction === 'outbound' ? 'bg-blue-900/30 text-blue-200' : 'bg-gray-900 text-gray-200'}`}>
                      <span className="text-gray-500">{m.direction === 'outbound' ? '📤' : '📥'}</span> {m.content?.slice(0, 150)}
                      <p className="text-[9px] text-gray-600 mt-0.5">{new Date(m.createdAt).toLocaleTimeString('es-MX')}</p>
                    </div>
                  ))}
                  {assignmentMessages.length === 0 && <p className="text-xs text-gray-500 text-center">Sin mensajes</p>}
                </div>

                {/* Manual message */}
                <div className="flex gap-2 pt-2 border-t border-gray-700">
                  <input
                    value={driverMsg}
                    onChange={(e) => setDriverMsg(e.target.value)}
                    placeholder="Mensaje al repartidor..."
                    className="flex-1 rounded-lg border border-gray-600 bg-gray-900 px-2 py-1.5 text-xs text-white"
                    onKeyDown={(e) => e.key === 'Enter' && sendDriverMsg()}
                  />
                  <button onClick={sendDriverMsg} className="rounded-lg bg-blue-600 px-2 py-1.5 text-xs text-white">Enviar</button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-8 text-center text-gray-500 text-sm">
                Selecciona una asignación
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pay Driver Modal */}
      {payingDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-gray-800 border border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Pagar repartidor</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400">Monto a pagar ($)</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(parseFloat(e.target.value) || 0)} min={0} className="w-full vspro-input" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPayingDriver(null)} className="flex-1 rounded-lg border border-gray-600 py-2 text-sm text-gray-300">Cancelar</button>
                <button
                  onClick={async () => {
                    await api.post(`/delivery/drivers/${payingDriver}/pay`, { amount: payAmount });
                    setPayingDriver(null);
                    refetchDrivers();
                  }}
                  className="flex-1 rounded-lg bg-green-600 py-2 text-sm text-white hover:bg-green-700"
                >Confirmar pago</button>
              </div>
            </div>
          </div>
        </div>
      )}

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
