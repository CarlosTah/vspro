'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function TicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved' | 'closed'>('all');
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [resolveNote, setResolveNote] = useState('');
  const [showResolve, setShowResolve] = useState(false);

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    try {
      const data = await api.get('/tickets');
      setTickets(data);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (id: string) => {
    if (!replyText.trim()) return;
    await api.post(`/tickets/${id}/reply`, { message: replyText });
    setReplyText('');
    loadTickets();
  };

  const handleResolve = async (id: string) => {
    await api.patch(`/tickets/${id}/resolve`, { resolutionNote: resolveNote });
    setShowResolve(false);
    setResolveNote('');
    setSelectedTicket(null);
    loadTickets();
  };

  const handleAssign = async (id: string) => {
    await api.patch(`/tickets/${id}/assign`, { assignedTo: 'admin' });
    loadTickets();
  };

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);

  const openCount = tickets.filter(t => t.status === 'open').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;

  const priorityColors: Record<string, string> = {
    high: 'bg-red-900/40 text-red-300',
    medium: 'bg-yellow-900/40 text-yellow-300',
    low: 'bg-green-900/40 text-green-300',
  };

  const statusColors: Record<string, string> = {
    open: 'bg-red-900/40 text-red-300',
    in_progress: 'bg-yellow-900/40 text-yellow-300',
    resolved: 'bg-green-900/40 text-green-300',
    closed: 'bg-gray-700 text-gray-400',
  };

  const statusLabels: Record<string, string> = {
    open: 'Abierto',
    in_progress: 'En progreso',
    resolved: 'Resuelto',
    closed: 'Cerrado',
  };

  if (loading) return <div className="p-6 text-gray-400">Cargando...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Tickets de Soporte</h1>
        <p className="text-sm text-gray-400 mt-1">
          {openCount > 0 && <span className="text-red-400 font-medium">{openCount} abiertos</span>}
          {inProgressCount > 0 && <span className="text-yellow-400 font-medium ml-3">{inProgressCount} en progreso</span>}
          {openCount === 0 && inProgressCount === 0 && <span className="text-green-400">Sin tickets pendientes</span>}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {f === 'all' ? `Todos (${tickets.length})` : `${statusLabels[f]} (${tickets.filter(t => t.status === f).length})`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket List */}
        <div className="lg:col-span-2 space-y-3">
          {filtered.map(ticket => (
            <div
              key={ticket.id}
              onClick={() => setSelectedTicket(ticket)}
              className={`rounded-xl border bg-gray-800 p-4 cursor-pointer transition-colors ${
                selectedTicket?.id === ticket.id ? 'border-blue-500' : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityColors[ticket.priority] ?? ''}`}>
                  {ticket.priority === 'high' ? '🔴' : ticket.priority === 'medium' ? '🟡' : '🟢'} {ticket.priority}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[ticket.status] ?? ''}`}>
                  {statusLabels[ticket.status]}
                </span>
                <span className="text-[10px] text-gray-500 font-mono">{ticket.ticketNumber}</span>
              </div>
              <p className="text-sm font-medium text-white">{ticket.subject}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                <span>👤 {ticket.customerName ?? 'Sin nombre'}</span>
                <span>{new Date(ticket.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-500">Sin tickets en este filtro</div>
          )}
        </div>

        {/* Ticket Detail Panel */}
        <div className="lg:col-span-1">
          {selectedTicket ? (
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-5 space-y-4 sticky top-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-gray-400">{selectedTicket.ticketNumber}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[selectedTicket.status]}`}>
                  {statusLabels[selectedTicket.status]}
                </span>
              </div>

              <div>
                <h3 className="text-white font-semibold">{selectedTicket.subject}</h3>
                <p className="text-sm text-gray-300 mt-2">{selectedTicket.description}</p>
              </div>

              <div className="text-xs text-gray-400 space-y-1 pt-2 border-t border-gray-700">
                <p>👤 {selectedTicket.customerName ?? 'N/A'}</p>
                {selectedTicket.customerPhone && <p>📱 {selectedTicket.customerPhone}</p>}
                <p>📅 {new Date(selectedTicket.createdAt).toLocaleString('es-MX')}</p>
                {selectedTicket.assignedTo && <p>👷 Asignado: {selectedTicket.assignedTo}</p>}
              </div>

              {/* Resolution notes */}
              {selectedTicket.resolutionNote && (
                <div className="bg-gray-900 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Notas:</p>
                  <p className="text-sm text-gray-200 whitespace-pre-wrap">{selectedTicket.resolutionNote}</p>
                </div>
              )}

              {/* Actions */}
              {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' && (
                <div className="space-y-2 pt-2 border-t border-gray-700">
                  {/* Reply */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Agregar nota..."
                      className="flex-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleReply(selectedTicket.id)}
                    />
                    <button
                      onClick={() => handleReply(selectedTicket.id)}
                      disabled={!replyText.trim()}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Enviar
                    </button>
                  </div>

                  <div className="flex gap-2">
                    {selectedTicket.status === 'open' && (
                      <button
                        onClick={() => handleAssign(selectedTicket.id)}
                        className="flex-1 rounded-lg border border-yellow-700 py-1.5 text-xs text-yellow-300 hover:bg-yellow-900/30"
                      >
                        Tomar ticket
                      </button>
                    )}
                    {!showResolve ? (
                      <button
                        onClick={() => setShowResolve(true)}
                        className="flex-1 rounded-lg border border-green-700 py-1.5 text-xs text-green-300 hover:bg-green-900/30"
                      >
                        Resolver
                      </button>
                    ) : (
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={resolveNote}
                          onChange={(e) => setResolveNote(e.target.value)}
                          placeholder="Nota de resolución..."
                          className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResolve(selectedTicket.id)}
                            className="flex-1 rounded-lg bg-green-600 py-1.5 text-xs text-white hover:bg-green-700"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setShowResolve(false)}
                            className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-400"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-8 text-center text-gray-500 text-sm">
              Selecciona un ticket para ver detalles
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
