'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useSidebar } from '@/hooks/use-sidebar';
import { api } from '@/lib/api';

export function Header() {
  const { user, tenant, logout } = useAuth();
  const { toggle } = useSidebar();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [badgeCount, setBadgeCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  const businessInitials = (tenant?.businessName ?? 'V')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Fetch logo on mount
  useEffect(() => {
    api
      .get('/media-assets?type=logo')
      .then((assets: any[]) => {
        if (assets?.length > 0 && assets[0].url) setLogoUrl(assets[0].url);
      })
      .catch(() => {});
  }, []);

  // Fetch notifications on mount + every 30s
  useEffect(() => {
    const fetchNotifs = () => {
      api
        .get('/notifications/badge')
        .then((d: any) => setBadgeCount(d.count ?? 0))
        .catch(() => {});
      api
        .get('/notifications/recent')
        .then((d: any) => setNotifications(d ?? []))
        .catch(() => {});
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    if (menuOpen || bellOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen, bellOpen]);

  return (
    <header className="flex h-14 lg:h-16 items-center justify-between border-b border-card-border bg-surface px-4 lg:px-6 pt-[env(safe-area-inset-top)]">
      {/* Left: Hamburger (mobile) + Business Name */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="lg:hidden rounded-lg p-2 text-muted-foreground hover:bg-card hover:text-white transition-colors"
          aria-label="Abrir menú"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
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
        {/* Bell → notification dropdown */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setBellOpen(!bellOpen)}
            className="relative rounded-full p-2 text-muted-foreground hover:bg-card transition-colors"
            aria-label="Notificaciones"
          >
            🔔
            {badgeCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-card-border bg-card shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-card-border flex justify-between items-center">
                <span className="text-sm font-semibold text-white">Notificaciones</span>
                {badgeCount > 0 && (
                  <span className="text-xs text-accent">{badgeCount} pendiente(s)</span>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map((n, i) => (
                    <div
                      key={i}
                      className="px-4 py-2.5 border-b border-card-border/50 hover:bg-surface transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{n.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{n.title}</p>
                          <p className="text-[10px] text-muted">
                            {n.subtitle}
                            {n.total ? ` · $${parseFloat(n.total).toLocaleString()}` : ''}
                          </p>
                        </div>
                        <span className="text-[9px] text-muted whitespace-nowrap">
                          {new Date(n.createdAt).toLocaleTimeString('es-MX', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="px-4 py-6 text-center text-xs text-muted">
                    Sin notificaciones recientes
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setBellOpen(false);
                  router.push('/orders');
                }}
                className="w-full px-4 py-2.5 text-center text-xs text-accent hover:bg-surface border-t border-card-border transition-colors"
              >
                Ver todos los pedidos →
              </button>
            </div>
          )}
        </div>

        {/* Avatar → dropdown menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2"
            aria-label="Menú de usuario"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-white">
                {businessInitials}
              </div>
            )}
            <span className="text-sm font-medium text-slate-200 hidden sm:inline">
              {user?.name ?? 'Usuario'}
            </span>
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-card-border bg-card shadow-2xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-card-border">
                <p className="text-sm font-medium text-white truncate">{user?.name ?? 'Usuario'}</p>
                <p className="text-xs text-muted truncate">{user?.email ?? ''}</p>
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  router.push('/settings');
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-surface transition-colors"
              >
                ⚙️ Configuración
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  router.push('/settings/media');
                }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-surface transition-colors"
              >
                🖼️ Material gráfico
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
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
