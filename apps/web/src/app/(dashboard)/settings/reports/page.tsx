'use client';

import { useState, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

export default function ReportSettingsPage() {
  const { data: schedule, loading } = useApi<any>('/settings/report-schedule');
  const [form, setForm] = useState({
    enabled: false,
    frequency: 'daily',
    time: '20:00',
    phone: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (schedule) {
      setForm({
        enabled: schedule.enabled ?? false,
        frequency: schedule.frequency ?? 'daily',
        time: schedule.time ?? '20:00',
        phone: schedule.phone ?? '',
      });
    }
  }, [schedule]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.patch('/settings/report-schedule', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando configuración...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Reportes automáticos</h1>
        <p className="text-sm text-gray-400">Recibe un resumen de tu negocio por WhatsApp automáticamente</p>
      </div>

      <div className="rounded-xl border border-card-border bg-card p-6 space-y-6">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Activar reportes por WhatsApp</p>
            <p className="text-xs text-gray-400">Recibirás un resumen con ventas, pedidos y más</p>
          </div>
          <button
            onClick={() => setForm({ ...form, enabled: !form.enabled })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              form.enabled ? 'bg-accent' : 'bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                form.enabled ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {form.enabled && (
          <>
            {/* Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Frecuencia</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'daily', label: 'Diario', desc: 'Cada día' },
                  { value: 'weekly', label: 'Semanal', desc: 'Cada lunes' },
                  { value: 'monthly', label: 'Mensual', desc: 'Día 1 del mes' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm({ ...form, frequency: opt.value })}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      form.frequency === opt.value
                        ? 'border-accent bg-accent/10 text-white'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs mt-0.5 opacity-70">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Time */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Hora de envío</label>
              <select
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="vspro-input w-48"
              >
                {Array.from({ length: 24 }, (_, i) => {
                  const h = i.toString().padStart(2, '0');
                  return <option key={h} value={`${h}:00`}>{h}:00 hrs</option>;
                })}
              </select>
              <p className="text-xs text-gray-500 mt-1">Hora de México (Ciudad de México)</p>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Número de WhatsApp</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="529841234567 (sin +, sin espacios)"
                className="vspro-input w-full"
              />
              <p className="text-xs text-gray-500 mt-1">Incluye código de país (52 para México)</p>
            </div>

            {/* Preview */}
            <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
              <p className="text-xs text-gray-400 mb-2">📱 Vista previa del reporte:</p>
              <div className="bg-green-900/20 border border-green-800/30 rounded-lg p-3 text-sm text-gray-200 whitespace-pre-line">
{`📊 *Resumen ${form.frequency === 'daily' ? 'del día' : form.frequency === 'weekly' ? 'de la semana' : 'del mes'}* — Tu Negocio
📅 ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}

💰 Ventas: $4,580 MXN (12 pedidos)
✅ Entregados: 9
📋 Pendientes: 3
👥 Nuevos clientes: 4

🏆 *Top productos:*
  1. Taco al Pastor (24 uds)
  2. Agua fresca (18 uds)

¡Buen trabajo! 🚀`}
              </div>
            </div>
          </>
        )}

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="vspro-btn-primary disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar configuración'}
          </button>
          {saved && (
            <span className="text-sm text-green-400">✓ Guardado</span>
          )}
        </div>
      </div>
    </div>
  );
}
