'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function AiQualityPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/conversations/quality/metrics')
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-400 text-center">Cargando métricas...</div>;
  if (!metrics) return <div className="p-8 text-gray-500 text-center">No se pudieron cargar las métricas</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Calidad del Agente IA</h1>
        <p className="text-sm text-gray-400">Audita y mejora las respuestas de tu agente con feedback directo</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <p className="text-3xl font-bold text-white">{metrics.satisfactionRate}%</p>
          <p className="text-xs text-gray-400 mt-1">Satisfacción</p>
          <div className="mt-2 w-full bg-gray-700 rounded-full h-1.5">
            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${metrics.satisfactionRate}%` }} />
          </div>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <p className="text-3xl font-bold text-green-400">{metrics.thumbsUp}</p>
          <p className="text-xs text-gray-400 mt-1">👍 Correctas</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <p className="text-3xl font-bold text-red-400">{metrics.thumbsDown}</p>
          <p className="text-xs text-gray-400 mt-1">👎 Incorrectas</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5">
          <p className="text-3xl font-bold text-blue-400">{metrics.corrections}</p>
          <p className="text-xs text-gray-400 mt-1">✏️ Correcciones</p>
          <p className="text-[10px] text-gray-500 mt-1">Auto-aprendidas en KB</p>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-blue-700/50 bg-blue-900/10 p-5">
        <h3 className="text-sm font-medium text-blue-300 mb-2">¿Cómo funciona?</h3>
        <ol className="text-xs text-blue-400 space-y-1 list-decimal list-inside">
          <li>Ve a <strong>Conversaciones</strong> y revisa los mensajes del agente</li>
          <li>Dale 👍 si la respuesta fue correcta, 👎 si no</li>
          <li>Al dar 👎, escribe la respuesta correcta</li>
          <li>La corrección se guarda automáticamente en la <strong>Base de Conocimiento</strong></li>
          <li>En la siguiente conversación similar, el agente usará la respuesta correcta</li>
        </ol>
      </div>

      {/* Needs Attention */}
      {metrics.needsAttention?.length > 0 && (
        <div className="rounded-xl border border-red-700/50 bg-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-700 bg-red-900/20">
            <h3 className="text-sm font-semibold text-red-300">⚠️ Necesitan corrección ({metrics.needsAttention.length})</h3>
            <p className="text-xs text-gray-400">Mensajes marcados como incorrectos sin corrección — ve a Conversaciones para corregirlos</p>
          </div>
          <div className="divide-y divide-gray-700/50">
            {metrics.needsAttention.map((msg: any) => (
              <div key={msg.id} className="px-5 py-3">
                <p className="text-sm text-white">{msg.message?.slice(0, 150)}...</p>
                <p className="text-xs text-gray-500 mt-1">{new Date(msg.createdAt).toLocaleString('es-MX')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Corrections */}
      {metrics.recentCorrections?.length > 0 && (
        <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-white">✏️ Correcciones recientes (auto-aprendidas)</h3>
          </div>
          <div className="divide-y divide-gray-700/50">
            {metrics.recentCorrections.map((c: any) => (
              <div key={c.id} className="px-5 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-red-400 line-through">{c.originalMessage?.slice(0, 100)}</p>
                    <p className="text-sm text-green-300 mt-1">✓ {c.correction}</p>
                  </div>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleDateString('es-MX')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {metrics.totalAiMessages === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-3xl mb-2">🧠</p>
          <p>Tu agente aún no tiene mensajes para evaluar.</p>
          <p className="text-xs mt-1">Cuando el agente empiece a responder, podrás calificar y mejorar sus respuestas aquí.</p>
        </div>
      )}
    </div>
  );
}
