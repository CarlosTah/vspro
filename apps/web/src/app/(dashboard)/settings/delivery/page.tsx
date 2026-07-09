'use client';

import { useState, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

export default function DeliverySettingsPage() {
  const { data: settings, loading } = useApi<any>('/settings/delivery');
  const [form, setForm] = useState({
    shippingCost: 30,
    autoDispatchEnabled: true,
    timeoutMinutes: 10,
    maxRetries: 3,
    autoPrintOnPayment: false,
    notifyClientOnShipped: true,
    notifyClientOnDelivered: true,
    dispatchMessage: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setForm({ ...form, ...settings });
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch('/settings/delivery', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuración de entregas</h1>
        <p className="text-sm text-gray-400">Automatiza el despacho de pedidos a tus repartidores</p>
      </div>

      <div className="rounded-xl border border-card-border bg-card p-6 space-y-6">

          {/* Shipping Cost */}
          <div className="space-y-2">
            <label className="text-sm text-gray-300">Costo de envío ($)</label>
            <input
              type="number"
              value={form.shippingCost}
              onChange={(e) => setForm({ ...form, shippingCost: Number(e.target.value) })}
              className="vspro-input w-32"
              min={0}
              step={5}
            />
            <p className="text-xs text-gray-500">Se suma al total cuando el cliente pide envío a domicilio</p>
          </div>

        {/* Auto-dispatch */}
        <ToggleRow
          label="Despacho automático"
          description="Cuando producción marca un pedido como 'Listo', enviar automáticamente a un repartidor disponible"
          checked={form.autoDispatchEnabled}
          onChange={(v) => setForm({ ...form, autoDispatchEnabled: v })}
        />

        {form.autoDispatchEnabled && (
          <>
            {/* Timeout */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Tiempo de espera antes de reasignar
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={form.timeoutMinutes}
                  onChange={(e) => setForm({ ...form, timeoutMinutes: parseInt(e.target.value) || 10 })}
                  className="vspro-input w-24 text-center"
                />
                <span className="text-sm text-gray-400">minutos</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Si el repartidor no responde en este tiempo, se ofrecerá al siguiente</p>
            </div>

            {/* Max retries */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Máximo de intentos
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={form.maxRetries}
                  onChange={(e) => setForm({ ...form, maxRetries: parseInt(e.target.value) || 3 })}
                  className="vspro-input w-24 text-center"
                />
                <span className="text-sm text-gray-400">repartidores</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Después de este número de intentos, se notifica al admin</p>
            </div>

            {/* Dispatch message template */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Mensaje para el repartidor
              </label>
              <textarea
                value={form.dispatchMessage}
                onChange={(e) => setForm({ ...form, dispatchMessage: e.target.value })}
                rows={4}
                className="vspro-input w-full resize-none text-sm"
                placeholder="📦 Pedido #{orderNumber} listo para entrega.&#10;📍 Dirección: {address}&#10;💰 Total: ${total}&#10;&#10;¿Puedes recogerlo? Responde SI o NO"
              />
              <p className="text-xs text-gray-500 mt-1">Variables disponibles: {'{orderNumber}'}, {'{address}'}, {'{total}'}, {'{customerName}'}</p>
            </div>
          </>
        )}

        <div className="border-t border-gray-700 pt-4" />

        {/* Auto-print */}
        <ToggleRow
          label="Impresión automática al pagar"
          description="Imprime el ticket automáticamente cuando se verifica el pago (requiere impresora conectada)"
          checked={form.autoPrintOnPayment}
          onChange={(v) => setForm({ ...form, autoPrintOnPayment: v })}
        />

        <div className="border-t border-gray-700 pt-4" />

        {/* Client notifications */}
        <ToggleRow
          label="Notificar al cliente: Pedido en camino"
          description="Envía WhatsApp al cliente cuando el repartidor acepta la entrega"
          checked={form.notifyClientOnShipped}
          onChange={(v) => setForm({ ...form, notifyClientOnShipped: v })}
        />

        <ToggleRow
          label="Notificar al cliente: Pedido entregado"
          description="Envía WhatsApp al cliente cuando el repartidor confirma la entrega"
          checked={form.notifyClientOnDelivered}
          onChange={(v) => setForm({ ...form, notifyClientOnDelivered: v })}
        />

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="vspro-btn-primary disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
          {saved && <span className="text-sm text-green-400">✓ Guardado</span>}
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-gray-400 max-w-md">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-gray-600'
        }`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-0.5'
        }`} />
      </button>
    </div>
  );
}
