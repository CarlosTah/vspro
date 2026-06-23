'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { VsproLogo } from '@/components/vspro-logo';

const INDUSTRIES = [
  { value: 'restaurante', label: 'Restaurante / Comida', icon: '🍽️' },
  { value: 'barberia', label: 'Barbería / Salón', icon: '💈' },
  { value: 'ropa', label: 'Tienda de Ropa', icon: '👕' },
  { value: 'taller', label: 'Taller Mecánico', icon: '🔧' },
  { value: 'clinica', label: 'Clínica / Consultorio', icon: '🏥' },
  { value: 'inmobiliaria', label: 'Inmobiliaria', icon: '🏠' },
  { value: 'ecommerce', label: 'Tienda Online', icon: '🛒' },
];

const PLANS = [
  { value: 'basic', label: 'Básico', price: '$990', features: ['1 canal WhatsApp', 'Agente IA', 'Hasta 200 pedidos/mes'] },
  { value: 'pro', label: 'Profesional', price: '$1,490', features: ['3 canales', 'Reportes avanzados', 'Pedidos ilimitados'] },
  { value: 'enterprise', label: 'Avanzado', price: '$2,499', features: ['Canales ilimitados', 'API completa', 'Soporte prioritario'] },
];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Form state
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [industry, setIndustry] = useState('');
  const [plan, setPlan] = useState('basic');

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50);
  };

  const handleBusinessNameChange = (value: string) => {
    setBusinessName(value);
    if (!slug || slug === generateSlug(businessName)) {
      setSlug(generateSlug(value));
    }
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/register', {
        slug,
        businessName,
        email,
        ownerName,
        password,
        industry,
        plan,
      });

      // Auto-login with returned token
      api.setAuth(res.accessToken, res.tenant.slug);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Error al registrar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const canAdvanceStep1 = ownerName && email && password.length >= 8;
  const canAdvanceStep2 = businessName && slug && industry;

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="mb-6">
          <VsproLogo size="lg" showSlogan={true} />
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all ${
                s === step ? 'w-8 bg-blue-500' : s < step ? 'w-8 bg-blue-700' : 'w-8 bg-gray-700'
              }`}
            />
          ))}
        </div>

        <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 shadow-xl">
          {/* Step 1: Personal Info */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">Crea tu cuenta</h2>
                <p className="text-sm text-gray-400">Empieza con 7 días gratis, sin tarjeta.</p>
              </div>

              {error && (
                <div className="rounded-lg bg-red-900/50 border border-red-700 px-4 py-3">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Tu nombre</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="José Hernández"
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {password && password.length < 8 && (
                  <p className="text-xs text-amber-400 mt-1">Mínimo 8 caracteres</p>
                )}
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!canAdvanceStep1}
                className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
              </button>

              <div className="text-center">
                <a href="/login" className="text-sm text-blue-400 hover:text-blue-300">
                  ¿Ya tienes cuenta? Inicia sesión
                </a>
              </div>
            </div>
          )}

          {/* Step 2: Business Info */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">Tu negocio</h2>
                <p className="text-sm text-gray-400">Configuraremos todo según tu giro.</p>
              </div>

              {error && (
                <div className="rounded-lg bg-red-900/50 border border-red-700 px-4 py-3">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Nombre del negocio</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => handleBusinessNameChange(e.target.value)}
                  placeholder="Tortillería Don José"
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">URL de tu negocio</label>
                <div className="flex items-center rounded-lg border border-gray-600 bg-gray-900 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="mi-negocio"
                    className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
                  />
                  <span className="pr-3 text-xs text-gray-500">.vspro.app</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">Giro de tu negocio</label>
                <div className="grid grid-cols-2 gap-2">
                  {INDUSTRIES.map((ind) => (
                    <button
                      key={ind.value}
                      type="button"
                      onClick={() => setIndustry(ind.value)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                        industry === ind.value
                          ? 'border-blue-500 bg-blue-900/30 text-white'
                          : 'border-gray-600 bg-gray-900 text-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <span>{ind.icon}</span>
                      <span className="truncate">{ind.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 rounded-lg border border-gray-600 py-3 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Atrás
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!canAdvanceStep2}
                  className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Plan Selection */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">Elige tu plan</h2>
                <p className="text-sm text-gray-400">7 días gratis en cualquier plan. Cancela cuando quieras.</p>
              </div>

              {error && (
                <div className="rounded-lg bg-red-900/50 border border-red-700 px-4 py-3">
                  <p className="text-sm text-red-300">{error}</p>
                </div>
              )}

              <div className="space-y-3">
                {PLANS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPlan(p.value)}
                    className={`w-full flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                      plan === p.value
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-gray-600 bg-gray-900 hover:border-gray-500'
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      plan === p.value ? 'border-blue-500' : 'border-gray-500'
                    }`}>
                      {plan === p.value && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-medium text-white">{p.label}</span>
                        <span className="text-sm font-semibold text-blue-400">{p.price}<span className="text-xs text-gray-400">/mes</span></span>
                      </div>
                      <ul className="mt-1.5 space-y-0.5">
                        {p.features.map((f, i) => (
                          <li key={i} className="text-xs text-gray-400 flex items-center gap-1">
                            <span className="text-green-400">✓</span> {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 rounded-lg border border-gray-600 py-3 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Creando cuenta...' : 'Crear mi cuenta'}
                </button>
              </div>

              <p className="text-center text-xs text-gray-500">
                Al registrarte aceptas nuestros términos de servicio.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          VSPRO · Pedidos omnicanal para PYMEs
        </p>
      </div>
    </div>
  );
}
