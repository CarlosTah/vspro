'use client';

interface Props {
  result: {
    tenant: { slug: string; businessName: string; trialEndsAt: string };
    credentials: { email: string; tenantSlug: string };
    products: number;
    nextSteps: string[];
  };
}

export function StepComplete({ result }: Props) {
  const trialEnd = new Date(result.tenant.trialEndsAt).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6 text-center">
      <div className="text-5xl">🎉</div>

      <div>
        <h2 className="text-xl font-semibold text-white">¡{result.tenant.businessName} está listo!</h2>
        <p className="text-sm text-gray-400 mt-1">
          Tu trial gratuito está activo hasta el {trialEnd}
        </p>
      </div>

      {/* Resumen */}
      <div className="rounded-lg border border-gray-600 bg-gray-900 p-4 text-left">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Tu panel</p>
        <p className="text-sm text-blue-400 font-mono">
          https://{result.tenant.slug}.vspro.app
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Email: {result.credentials.email}
        </p>
        {result.products > 0 && (
          <p className="text-xs text-gray-500">
            {result.products} producto{result.products > 1 ? 's' : ''} creado{result.products > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Próximos pasos */}
      <div className="text-left">
        <p className="text-sm font-medium text-gray-300 mb-2">Próximos pasos:</p>
        <ul className="space-y-2">
          {result.nextSteps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
              <span className="text-green-400 mt-0.5">✓</span>
              {step}
            </li>
          ))}
        </ul>
      </div>

      <a
        href={`http://localhost:3002/login`}
        className="block w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        Ir a mi panel →
      </a>
    </div>
  );
}
