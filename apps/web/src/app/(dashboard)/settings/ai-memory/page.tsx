'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function AiMemoryPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/customers').then(setCustomers).catch(console.error).finally(() => setLoading(false));
  }, []);

  const loadMemories = async (customerId: string) => {
    setSelectedCustomer(customerId);
    try {
      const data = await api.get(`/ai/memories/${customerId}`);
      setMemories(data);
    } catch {
      setMemories([]);
    }
  };

  const typeLabels: Record<string, { label: string; color: string }> = {
    preference: { label: 'Preferencia', color: 'bg-purple-50 text-purple-700' },
    order_history: { label: 'Historial', color: 'bg-blue-50 text-blue-700' },
    conversation_summary: { label: 'Resumen', color: 'bg-green-50 text-green-700' },
  };

  if (loading) return <div className="p-8 text-gray-400">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Memoria de IA</h1>
        <p className="text-sm text-gray-500">
          La IA recuerda preferencias y pedidos anteriores de cada cliente para dar respuestas más personalizadas.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Lista de clientes */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-700">Clientes</h3>
          </div>
          <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => loadMemories(c.id)}
                className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                  selectedCustomer === c.id ? 'bg-brand-50' : ''
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{c.name ?? 'Sin nombre'}</p>
                <p className="text-xs text-gray-400">{c.channelType} · {c.channelId}</p>
              </button>
            ))}
            {customers.length === 0 && (
              <p className="p-4 text-sm text-gray-400">No hay clientes aún</p>
            )}
          </div>
        </div>

        {/* Memorias del cliente seleccionado */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="text-sm font-semibold text-gray-700">
              {selectedCustomer ? 'Memorias del cliente' : 'Selecciona un cliente'}
            </h3>
          </div>

          {!selectedCustomer ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-4xl mb-2">🧠</p>
              <p>Selecciona un cliente para ver qué recuerda la IA sobre él</p>
            </div>
          ) : memories.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p>No hay memorias guardadas para este cliente</p>
              <p className="text-xs mt-1">Se generan automáticamente después de cada conversación</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {memories.map((m: any) => {
                const typeInfo = typeLabels[m.type] ?? { label: m.type, color: 'bg-gray-100 text-gray-600' };
                return (
                  <div key={m.id} className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(m.createdAt).toLocaleDateString('es-MX')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{m.content}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Explicación */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <h4 className="text-sm font-medium text-blue-800 mb-2">¿Cómo funciona la memoria?</h4>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li>Después de cada conversación, la IA genera un resumen y lo guarda como memoria</li>
          <li>Las preferencias del cliente se detectan automáticamente (ej: "siempre pide sin cebolla")</li>
          <li>El historial de pedidos se registra para sugerir productos en futuras conversaciones</li>
          <li>La búsqueda usa embeddings (pgvector) para encontrar las memorias más relevantes al mensaje actual</li>
          <li>Cada tenant tiene sus memorias aisladas — ningún cliente de otro negocio puede acceder</li>
        </ul>
      </div>
    </div>
  );
}
