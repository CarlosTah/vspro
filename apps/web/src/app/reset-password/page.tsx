'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { VsproLogo } from '@/components/vspro-logo';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (!token) {
      setError('Token de recuperación no encontrado. Solicita un nuevo enlace.');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Error al restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  // No token in URL
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <VsproLogo size="lg" showSlogan={true} />
          </div>
          <div className="rounded-2xl bg-gray-800 border border-gray-700 p-8 shadow-xl text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-900/50 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">Enlace inválido</h2>
            <p className="text-sm text-gray-400">
              Este enlace no contiene un token válido. Solicita un nuevo enlace de recuperación.
            </p>
            <a
              href="/forgot-password"
              className="inline-block mt-2 text-sm text-blue-400 hover:text-blue-300"
            >
              Solicitar nuevo enlace
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8">
          <VsproLogo size="lg" showSlogan={true} />
        </div>

        {success ? (
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
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Contraseña actualizada</h2>
              <p className="text-sm text-gray-400">
                Tu contraseña ha sido restablecida correctamente. Ya puedes iniciar sesión con tu
                nueva contraseña.
              </p>
            </div>

            <button
              onClick={() => router.push('/login')}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Ir al inicio de sesión
            </button>
          </div>
        ) : (
          /* Form */
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl bg-gray-800 border border-gray-700 p-8 shadow-xl space-y-5"
          >
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">Nueva contraseña</h2>
              <p className="text-sm text-gray-400">
                Crea una nueva contraseña para tu cuenta. Debe tener al menos 8 caracteres.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-900/50 border border-red-700 px-4 py-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Nueva contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Guardando...' : 'Restablecer contraseña'}
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">
          Cargando...
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
