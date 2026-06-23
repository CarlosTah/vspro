'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function EscalationsPage() {
  const [escalations, setEscalations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all');
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  useEffect(() => {
    loadEscalations();
  }, []);

  const loadEscalations = async () => {
    try {
      const data = await api.get('/escalations');
      setEscalations(data);
    } catch {
      setEscalations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string) => {
    await api.patch(`/escalations/${id}/resolve`, { resolutionNote, resolvedBy: 'admin' });
    setResolveId(null);
    setResolutionNote('');
    loadEscalations();
  };

  const handleStatusChange = async (id: string, status: string) => {
    await api.patch(`/escalations/${id}/status`, { status });
    loadEscalations();
  };

  const filtered = filter === 'all' ? escalations : escalations.filter(e => e.status === filter);

  const priorityColors: Record<string, string> = {
    high: 'bg-red-900/40 text-red-300 border-red-700',
    medium: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
    low: 'bg-green-900/40 text-green-300 border-green-700',
  };

  const statusColors: Record<string, string> = {
    open: 'bg-red-900/40 text-red-300',
    in_progress: 'bg-yellow-900/40 text-yellow-300',
    resolved: 'bg-green-900/40 text-green-300',
  };

  if (loading) return <div className="p-6 text-gray-400">Cargando...</div>;

  const openCount = escalations.filter(e => e.status === 'open').length;
  const inProgressCount = escalations.filter(e => e.status === 'in_progress').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Quejas y Escalaciones</h1>
          <p className="text-sm text-gray-400 mt-1">
            {openCount > 0 && <span className="text-red-400 font-medium">{openCount} abiertas</span>}
            {inProgressCount > 0 && <span className="text-yellow-400 font-medium ml-3">{inProgressCount} en progreso</span>}
            {openCount === 0 && inProgressCount === 0 && <span className="text-green-400">Sin quejas pendientes</span>}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'open', 'in_progress', 'resolved'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {f === 'all' ? `Todas (${escalations.length})` : f === 'open' ? `Abiertas (${openCount})` : f === 'in_progress' ? `En progreso (${inProgressCount})` : `Resueltas`}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(esc => (
          <div key={esc.id} className="rounded-xl border border-gray-700 bg-gray-800 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${priorityColors[esc.priority] ?? ''}`}>
                    {esc.priority === 'high' ? '🔴 Urgente' : esc.priority === 'medium' ? '🟡 Media' : '🟢 Baja'}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[esc.status] ?? ''}`}>
                    {esc.status === 'open' ? 'Abierta' : esc.status === 'in_progress' ? 'En progreso' : 'Resuelta'}
                  </span>
                  {esc.orderNumber && (
                    <span className="text-xs text-gray-500">Pedido #{esc.orderNumber}</span>
                  )}
                </div>
                <p className="text-white font-medium">{esc.reason}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  <span>👤 {esc.customerName ?? 'Sin nombre'}</span>
                  {esc.customerPhone && <span>📱 {esc.customerPhone}</span>}
                  <span>{new Date(esc.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {esc.resolutionNote && (
                  <p className="mt-2 text-sm text-green-300 bg-green-900/20 rounded-lg px-3 py-2">
                    ✅ {esc.resolutionNote}
                  </p>
                )}
              </div>

              {/* Actions */}
              {esc.status !== 'resolved' && (
                <div className="flex flex-col gap-1.5">
                  {esc.status === 'open' && (
                    <button
                      onClick={() => handleStatusChange(esc.id, 'in_progress')}
                      className="rounded-lg bg-yellow-600/20 border border-yellow-700 px-3 py-1 text-xs text-yellow-300 hover:bg-yellow-600/40"
                    >
                      Atender
                    </button>
                  )}
                  <button
                    onClick={() => setResolveId(esc.id)}
                    className="rounded-lg bg-green-600/20 border border-green-700 px-3 py-1 text-xs text-green-300 hover:bg-green-600/40"
                  >
                    Resolver
                  </button>
                </div>
              )}
            </div>

            {/* Resolve form */}
            {resolveId === esc.id && (
              <div className="mt-3 pt-3 border-t border-gray-700 flex gap-2">
                <input
                  type="text"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Nota de resolución (opcional)..."
                  className="flex-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  onClick={() => handleResolve(esc.id)}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setResolveId(null)}
                  className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            {filter === 'all' ? 'No hay escalaciones registradas' : `No hay escalaciones con estado "${filter}"`}
          </div>
        )}
      </div>
    </div>
  );
}
