'use client';

import { useAuth } from '@/lib/auth-context';

export function Header() {
  const { user, tenant, logout } = useAuth();

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="flex h-16 items-center justify-between border-b border-card-border bg-surface px-6">
      <div>
        <h2 className="text-subtitle font-heading text-white">
          {tenant?.businessName ?? 'Mi Negocio'}
        </h2>
        <p className="text-caption text-muted">
          Plan {tenant?.plan ?? 'Básico'} · {tenant?.slug ?? ''}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative rounded-full p-2 text-muted-foreground hover:bg-card transition-colors">
          🔔
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent animate-glow-pulse" />
        </button>

        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-white">
            {initials}
          </div>
          <span className="text-sm font-medium text-slate-200">{user?.name ?? 'Usuario'}</span>
          <button
            onClick={logout}
            className="ml-2 text-xs text-muted hover:text-destructive transition-colors"
            title="Cerrar sesión"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
