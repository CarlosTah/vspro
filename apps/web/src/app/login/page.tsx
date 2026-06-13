'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { VsproLogo } from '@/components/vspro-logo';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password, tenantSlug);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Credenciales inválidas');
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

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-gray-800 border border-gray-700 p-8 shadow-xl space-y-5"
        >
          {error && (
            <div className="rounded-lg bg-red-900/50 border border-red-700 px-4 py-3">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Tu negocio
            </label>
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
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>

          <div className="text-center">
            <a href="/onboarding" className="text-sm text-blue-400 hover:text-blue-300">
              ¿No tienes cuenta? Regístrate gratis
            </a>
          </div>
        </form>

        <p className="text-center text-xs text-gray-500 mt-6">
          VSPRO · Pedidos omnicanal para PYMEs
        </p>
      </div>
    </div>
  );
}
