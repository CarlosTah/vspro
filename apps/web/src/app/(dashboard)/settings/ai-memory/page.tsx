'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function AiMemoryPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [memory, setMemory] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/customers').then(setCustomers).catch(console.error).finally(() => setLoading(false));
  }, []);

  const loadMemory = async (customerId: string) => {
    setSelectedCustomer(customerId);
    try {
      const data = await api.get(`/customers/${customerId}/memory`);
      setMemory(data);
    } catch {
      setMemory(null);
    }
  };

  const clearMemory = async (customerId: string) => {
    if (!confirm('¿Borrar toda la memoria de este cliente? La IA olvidará sus preferencias.')) return;
    try {
      await api.delete(`/customers/${customerId}/memory`);
      setMemory(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="p-8 text-gray-400 text-center">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Memoria de IA</h1>
        <p className="text-sm text-gray-400">
          Lo que la IA recuerda de cada cliente: preferencias, historial, contexto de conversaciones.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Customer list */}
        <div className="rounded-xl border border-card-border bg-card overflow-hidden">
          <div className="border-b border-gray-700 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-300">Clientes ({customers.length})</h3>
          </div>
          <div className="divide-y divide-gray-800 max-h-[500px] overflow-y-auto">
            {customers.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 text-center">Sin clientes aún</p>
            ) : (
              customers.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => loadMemory(c.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-800/50 transition-colors ${
                    selectedCustomer === c.id ? 'bg-accent/10 border-l-2 border-l-accent' : ''
                  }`}
                >
                  <p className="text-sm text-white font-medium">{c.name ?? 'Sin nombre'}</p>
                  <p className="text-xs text-gray-500">{c.channelType} · {c.phone ?? c.channelId}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Memory display */}
        <div className="lg:col-span-2 rounded-xl border border-card-border bg-card p-5">
          {!selectedCustomer ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-3xl mb-2">🧠</p>
              <p>Selecciona un cliente para ver su memoria</p>
            </div>
          ) : !memory || ((!memory.profile || Object.keys(memory.profile).length === 0) && (!memory.episodes || memory.episodes.length === 0)) ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-3xl mb-2">💭</p>
              <p>La IA aún no ha guardado recuerdos de este cliente</p>
              <p className="text-xs mt-1">Se llenarán conforme la IA interactúe con ellos</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Profile data */}
              {memory.profile && Object.keys(memory.profile).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">📋 Perfil (datos estructurados)</h3>
                  <div className="space-y-2">
                    {Object.entries(memory.profile).map(([key, value]: [string, any]) => (
                      <div key={key} className="flex items-start gap-3 bg-gray-800/50 rounded-lg px-3 py-2">
                        <span className="text-xs font-medium text-accent min-w-[100px] capitalize">{key}</span>
                        <span className="text-sm text-white">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Episodes */}
              {memory.episodes && memory.episodes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">💬 Recuerdos conversacionales ({memory.episodes.length})</h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {memory.episodes.map((ep: any, i: number) => (
                      <div key={i} className="bg-gray-800/50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="rounded-full bg-purple-900/40 text-purple-300 px-2 py-0.5 text-xs">{ep.category}</span>
                          <span className="text-xs text-gray-500">{new Date(ep.createdAt).toLocaleDateString('es-MX')}</span>
                        </div>
                        <p className="text-sm text-gray-200">{ep.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Clear button */}
              <button
                onClick={() => clearMemory(selectedCustomer)}
                className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 rounded-lg px-3 py-1.5"
              >
                🗑️ Borrar memoria de este cliente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
