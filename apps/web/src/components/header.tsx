'use client';

import { useAuth } from '@/lib/auth-context';
import { useSidebar } from '@/hooks/use-sidebar';

export function Header() {
  const { user, tenant, logout } = useAuth();
  const { toggle } = useSidebar();

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="flex h-14 lg:h-16 items-center justify-between border-b border-card-border bg-surface px-4 lg:px-6">
      {/* Left: Hamburger (mobile) + Business Name */}
      <div className="flex items-center gap-3">
        {/* Hamburger button — only on mobile */}
        <button
          onClick={toggle}
          className="lg:hidden rounded-lg p-2 text-muted-foreground hover:bg-card hover:text-white transition-colors"
          aria-label="Abrir menú"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="min-w-0">
          <h2 className="text-sm lg:text-subtitle font-heading text-white truncate">
            {tenant?.businessName ?? 'Mi Negocio'}
          </h2>
          <p className="text-xs text-muted hidden sm:block">
            Plan {tenant?.plan ?? 'Básico'} · {tenant?.slug ?? ''}
          </p>
        </div>
      </div>

      {/* Right: Notifications + User */}
      <div className="flex items-center gap-2 lg:gap-4">
        <button className="relative rounded-full p-2 text-muted-foreground hover:bg-card transition-colors">
          🔔
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent animate-glow-pulse" />
        </button>

        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-white">
            {initials}
          </div>
          <span className="text-sm font-medium text-slate-200 hidden sm:inline">{user?.name ?? 'Usuario'}</span>
          <button
            onClick={logout}
            className="ml-1 lg:ml-2 text-xs text-muted hover:text-destructive transition-colors hidden sm:inline"
            title="Cerrar sesión"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
