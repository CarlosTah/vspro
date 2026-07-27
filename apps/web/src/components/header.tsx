'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useSidebar } from '@/hooks/use-sidebar';

export function Header() {
  const { user, tenant, logout } = useAuth();
  const { toggle } = useSidebar();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const initials = (user?.name ?? 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <header className="flex h-14 lg:h-16 items-center justify-between border-b border-card-border bg-surface px-4 lg:px-6 pt-[env(safe-area-inset-top)]">
      {/* Left: Hamburger (mobile) + Business Name */}
      <div className="flex items-center gap-3">
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
        {/* Bell → goes to escalations/notifications */}
        <button
          onClick={() => router.push('/escalations')}
          className="relative rounded-full p-2 text-muted-foreground hover:bg-card transition-colors"
          aria-label="Notificaciones"
        >
          🔔
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent animate-glow-pulse" />
        </button>

        {/* Avatar → dropdown menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2"
            aria-label="Menú de usuario"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-white">
              {initials}
            </div>
            <span className="text-sm font-medium text-slate-200 hidden sm:inline">{user?.name ?? 'Usuario'}</span>
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-card-border bg-card shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-card-border">
                <p className="text-sm font-medium text-white truncate">{user?.name ?? 'Usuario'}</p>
                <p className="text-xs text-muted truncate">{user?.email ?? ''}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); router.push('/settings'); }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-surface transition-colors"
              >
                ⚙️ Configuración
              </button>
              <button
                onClick={() => { setMenuOpen(false); router.push('/settings/media'); }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-surface transition-colors"
              >
                🖼️ Material gráfico
              </button>
              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-surface transition-colors border-t border-card-border"
              >
                🚪 Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
