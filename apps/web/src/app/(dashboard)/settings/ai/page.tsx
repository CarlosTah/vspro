'use client';

import { useState, useEffect } from 'react';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';

const TONES = [
  { value: 'friendly', label: '😊 Amigable', desc: 'Cálido y cercano' },
  { value: 'professional', label: '👔 Profesional', desc: 'Formal y preciso' },
  { value: 'casual', label: '🤙 Casual', desc: 'Relajado y natural' },
  { value: 'enthusiastic', label: '🎉 Entusiasta', desc: 'Energético y positivo' },
  { value: 'concise', label: '⚡ Conciso', desc: 'Directo al punto' },
];

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function AiConfigPage() {
  const { data: config, loading } = useApi<any>('/ai/config');
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { id, updatedAt, createdAt, ...payload } = form;
      await api.patch('/ai/config', payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-gray-400 p-4">Cargando configuración...</div>;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuración de IA</h1>
        <p className="text-sm text-gray-400">Personaliza el comportamiento del asistente virtual</p>
      </div>

      {/* Assistant Name */}
      <Section title="Identidad del asistente">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre del asistente">
            <input
              type="text"
              value={form.assistantName ?? ''}
              onChange={(e) => setForm({ ...form, assistantName: e.target.value })}
              className="input-field"
              placeholder="Ej: Viki, Luna, Asistente"
            />
          </Field>
          <Field label="Idioma">
            <select
              value={form.language ?? 'es'}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              className="input-field"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* Tone Selector */}
      <Section title="Tono de comunicación">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TONES.map((tone) => (
            <button
              key={tone.value}
              onClick={() => setForm({ ...form, tone: tone.value })}
              className={`rounded-lg border p-3 text-left transition-all ${
                form.tone === tone.value
                  ? 'border-purple-500 bg-purple-900/30 ring-1 ring-purple-500'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              <p className="text-sm font-medium text-white">{tone.label}</p>
              <p className="text-xs text-gray-400">{tone.desc}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* Messages */}
      <Section title="Mensajes automáticos">
        <Field label="Mensaje de bienvenida">
          <textarea
            value={form.welcomeMessage ?? ''}
            onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })}
            className="input-field h-20 resize-none"
            placeholder="¡Hola! Soy el asistente de tu negocio..."
          />
        </Field>
        <Field label="Mensaje fuera de horario">
          <textarea
            value={form.awayMessage ?? ''}
            onChange={(e) => setForm({ ...form, awayMessage: e.target.value })}
            className="input-field h-20 resize-none"
            placeholder="En este momento no estamos disponibles..."
          />
        </Field>
      </Section>

      {/* Business Hours */}
      <Section title="Horario de atención">
        <BusinessHoursPicker
          hours={form.businessHours ?? {}}
          onChange={(hours) => setForm({ ...form, businessHours: hours })}
        />
      </Section>

      {/* Custom Instructions */}
      <Section title="Instrucciones personalizadas">
        <Field label="Instrucciones adicionales para la IA">
          <textarea
            value={form.customInstructions ?? ''}
            onChange={(e) => setForm({ ...form, customInstructions: e.target.value })}
            className="input-field h-32 resize-none"
            placeholder="Ej: Siempre ofrece envío gratis en compras mayores a $500. No ofrezcas descuentos mayores al 10%..."
          />
        </Field>
      </Section>

      {/* Save Button */}
      <div className="flex items-center gap-4 pt-4 border-t border-gray-700">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-purple-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {saved && <span className="text-sm text-green-400">✓ Guardado</span>}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function BusinessHoursPicker({ hours, onChange }: { hours: any; onChange: (h: any) => void }) {
  const updateDay = (day: string, field: string, value: string) => {
    const updated = { ...hours, [day]: { ...(hours[day] ?? {}), [field]: value } };
    onChange(updated);
  };

  const toggleDay = (day: string) => {
    if (hours[day]?.enabled === false) {
      onChange({ ...hours, [day]: { ...hours[day], enabled: true } });
    } else {
      onChange({ ...hours, [day]: { ...(hours[day] ?? {}), enabled: false } });
    }
  };

  return (
    <div className="space-y-2">
      {DAYS.map((day, i) => {
        const dayKey = day.toLowerCase();
        const dayData = hours[dayKey] ?? { open: '09:00', close: '18:00', enabled: i < 6 };
        const enabled = dayData.enabled !== false;

        return (
          <div key={day} className="flex items-center gap-3">
            <button
              onClick={() => toggleDay(dayKey)}
              className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${
                enabled ? 'bg-purple-600 border-purple-500 text-white' : 'border-gray-600 text-gray-600'
              }`}
            >
              {enabled ? '✓' : ''}
            </button>
            <span className={`w-24 text-sm ${enabled ? 'text-white' : 'text-gray-500'}`}>{day}</span>
            {enabled && (
              <>
                <input
                  type="time"
                  value={dayData.open ?? '09:00'}
                  onChange={(e) => updateDay(dayKey, 'open', e.target.value)}
                  className="input-field-sm"
                />
                <span className="text-gray-500 text-xs">a</span>
                <input
                  type="time"
                  value={dayData.close ?? '18:00'}
                  onChange={(e) => updateDay(dayKey, 'close', e.target.value)}
                  className="input-field-sm"
                />
              </>
            )}
            {!enabled && <span className="text-xs text-gray-500">Cerrado</span>}
          </div>
        );
      })}
    </div>
  );
}
