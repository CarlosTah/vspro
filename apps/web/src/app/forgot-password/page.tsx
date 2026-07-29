'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { VsproLogo } from '@/components/vspro-logo';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email, tenantSlug });
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Error al enviar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8">
          <VsproLogo size="lg" showSlogan={true} />
        </div>

        {sent ? (
          /* Success state */
          <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 shadow-xl space-y-4">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-900/50 flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Revisa tu correo</h2>
              <p className="text-sm text-gray-400">
                Si la cuenta existe, recibirás un enlace para restablecer tu contraseña. El enlace
                expira en 1 hora.
              </p>
            </div>

            <div className="pt-2 text-center">
              <a href="/login" className="text-sm text-blue-400 hover:text-blue-300">
                Volver al inicio de sesión
              </a>
            </div>
          </div>
        ) : (
          /* Form */
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl bg-gray-800 border border-gray-700 p-8 shadow-xl space-y-5"
          >
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">Recuperar contraseña</h2>
              <p className="text-sm text-gray-400">
                Ingresa tu email y el slug de tu negocio. Te enviaremos un enlace para crear una
                nueva contraseña.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-900/50 border border-red-700 px-4 py-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Tu negocio</label>
              <div className="flex items-center rounded-lg border border-gray-600 bg-gray-900 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                <input
                  type="text"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value.toLowerCase())}
                  placeholder="mi-negocio"
                  required
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
                />
                <span className="pr-3 text-xs text-gray-500">.vspro.app</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </button>

            <div className="text-center">
              <a href="/login" className="text-sm text-blue-400 hover:text-blue-300">
                Volver al inicio de sesión
              </a>
            </div>
          </form>
        )}

        <p className="text-center text-xs text-gray-500 mt-6">
          VSPRO · Pedidos omnicanal para PYMEs
        </p>
      </div>
    </div>
  );
}
