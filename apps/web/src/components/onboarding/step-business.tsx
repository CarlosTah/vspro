'use client';

import { useState } from 'react';

interface Props {
  data: {
    slug: string;
    businessName: string;
    email: string;
    ownerName: string;
    password: string;
    phone?: string;
  };
  onChange: (data: Props['data']) => void;
  onNext: () => void;
}

export function StepBusiness({ data, onChange, onNext }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!data.businessName || data.businessName.length < 2) e.businessName = 'Nombre requerido (mín 2 caracteres)';
    if (!data.slug || !/^[a-z0-9-]+$/.test(data.slug)) e.slug = 'Solo letras minúsculas, números y guiones';
    if (!data.email || !data.email.includes('@')) e.email = 'Email inválido';
    if (!data.ownerName || data.ownerName.length < 2) e.ownerName = 'Nombre requerido';
    if (!data.password || data.password.length < 8) e.password = 'Mínimo 8 caracteres';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (validate()) onNext();
  };

  const update = (field: string, value: string) => {
    onChange({ ...data, [field]: value });
    if (errors[field]) setErrors({ ...errors, [field]: '' });
  };

  // Auto-generar slug desde el nombre del negocio
  const handleBusinessName = (value: string) => {
    const slug = value
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    onChange({ ...data, businessName: value, slug });
    if (errors.businessName) setErrors({ ...errors, businessName: '' });
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white">Datos de tu negocio</h2>
        <p className="text-sm text-gray-400 mt-1">Información básica para crear tu cuenta</p>
      </div>

      <div className="space-y-4">
        <Field
          label="Nombre del negocio"
          value={data.businessName}
          onChange={(v) => handleBusinessName(v)}
          error={errors.businessName}
          placeholder="Tortillería Don José"
        />

        <Field
          label="URL de tu panel"
          value={data.slug}
          onChange={(v) => update('slug', v)}
          error={errors.slug}
          placeholder="tortilleria-don-jose"
          prefix="https://"
          suffix=".vspro.app"
        />

        <Field
          label="Tu nombre"
          value={data.ownerName}
          onChange={(v) => update('ownerName', v)}
          error={errors.ownerName}
          placeholder="José Hernández"
        />

        <Field
          label="Email"
          type="email"
          value={data.email}
          onChange={(v) => update('email', v)}
          error={errors.email}
          placeholder="jose@tortilleria.com"
        />

        <Field
          label="Contraseña"
          type="password"
          value={data.password}
          onChange={(v) => update('password', v)}
          error={errors.password}
          placeholder="Mínimo 8 caracteres"
        />
      </div>

      <button
        onClick={handleNext}
        className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        Continuar →
      </button>
    </div>
  );
}

function Field({
  label, value, onChange, error, placeholder, type = 'text', prefix, suffix,
}: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; placeholder?: string; type?: string; prefix?: string; suffix?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">{label}</label>
      <div className="flex items-center">
        {prefix && <span className="text-xs text-gray-500 mr-1">{prefix}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-lg border bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-red-500' : 'border-gray-600'
          }`}
        />
        {suffix && <span className="text-xs text-gray-500 ml-1">{suffix}</span>}
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
