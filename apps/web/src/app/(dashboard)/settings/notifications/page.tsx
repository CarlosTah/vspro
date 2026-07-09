'use client';

import { useState, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

const defaultMessages: Record<string, string> = {
  in_production: '👨‍🍳 *Pedido en cocina*\n\n{{nombre}}, tu pedido *{{numero}}* fue enviado a cocina.\n\n⏳ Te avisamos cuando esté listo.',
  ready_pickup: '🎉 *¡Pedido listo!*\n\n{{nombre}}, tu pedido *{{numero}}* está listo para recoger.\n\n📍 Pasa cuando gustes. ¡Te esperamos!',
  ready_delivery: '🎉 *¡Pedido listo!*\n\n{{nombre}}, tu pedido *{{numero}}* está listo.\n\n🛵 Estamos contactando a un repartidor para enviártelo.',
  shipped: '🛵 *En camino*\n\n{{nombre}}, tu pedido *{{numero}}* ya va en camino.\n\n⏱ Llegará en aproximadamente 20-30 minutos.',
  delivered: '✅ *Entregado*\n\n{{nombre}}, tu pedido *{{numero}}* fue entregado.\n\n¡Gracias por tu compra! 🙏',
  cancelled: '❌ *Pedido cancelado*\n\n{{nombre}}, tu pedido *{{numero}}* fue cancelado.\n\nSi necesitas ayuda, escríbenos.',
};

export default function NotificationSettingsPage() {
  const { data: current, loading } = useApi<any>('/settings/notifications');
  const [messages, setMessages] = useState<Record<string, string>>(defaultMessages);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (current?.messages) setMessages({ ...defaultMessages, ...current.messages });
  }, [current]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch('/settings/notifications', { messages });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = (key: string) => {
    setMessages({ ...messages, [key]: defaultMessages[key] });
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>;

  const statusLabels: Record<string, { label: string; icon: string }> = {
    in_production: { label: 'Pedido en cocina', icon: '👨‍🍳' },
    ready_pickup: { label: 'Listo para recoger', icon: '🎉' },
    ready_delivery: { label: 'Listo para envío', icon: '🛵' },
    shipped: { label: 'En camino', icon: '🚀' },
    delivered: { label: 'Entregado', icon: '✅' },
    cancelled: { label: 'Cancelado', icon: '❌' },
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Mensajes de notificación</h1>
        <p className="text-sm text-gray-400">Personaliza los mensajes que se envían al cliente por WhatsApp</p>
      </div>

      <div className="rounded-xl border border-card-border bg-card p-4">
        <p className="text-xs text-gray-500 mb-2">Variables disponibles:</p>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs bg-gray-800 text-accent px-2 py-1 rounded">{'{{nombre}}'} = nombre del cliente</span>
          <span className="text-xs bg-gray-800 text-accent px-2 py-1 rounded">{'{{numero}}'} = número de pedido</span>
          <span className="text-xs bg-gray-800 text-accent px-2 py-1 rounded">{'{{total}}'} = total del pedido</span>
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(statusLabels).map(([key, { label, icon }]) => (
          <div key={key} className="rounded-xl border border-card-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <h3 className="text-sm font-semibold text-white">{label}</h3>
              </div>
              <button
                onClick={() => handleReset(key)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Restaurar default
              </button>
            </div>
            <textarea
              value={messages[key] ?? ''}
              onChange={(e) => setMessages({ ...messages, [key]: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-accent font-mono"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="vspro-btn-primary disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar mensajes'}
        </button>
        {saved && <span className="text-sm text-green-400">✓ Guardado</span>}
      </div>
    </div>
  );
}
