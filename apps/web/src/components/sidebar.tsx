'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { useAuth } from '@/lib/auth-context';
import { canAccessRoute, UserRole, ROLE_LABELS } from '@/lib/permissions';
import { VsproLogo } from '@/components/vspro-logo';
import { useSidebar } from '@/hooks/use-sidebar';

const navigation = [
  { name: 'Dashboard', href: '/', icon: '📊' },
  { name: 'Pedidos', href: '/orders', icon: '📋' },
  { name: 'Producción', href: '/production', icon: '🏭' },
  { name: 'Cocina', href: '/kitchen', icon: '🍳' },
  { name: 'Productos', href: '/products', icon: '📦' },
  { name: 'Clientes', href: '/customers', icon: '👥' },
  { name: 'Conversaciones', href: '/conversations', icon: '💬' },
  { name: 'Pagos', href: '/payments', icon: '💰' },
  { name: 'Entregas', href: '/deliveries', icon: '🛵' },
  { name: 'Reportes', href: '/reports', icon: '📈' },
];

const bottomNav = [
  { name: 'Configuración', href: '/settings', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { isOpen, close } = useSidebar();
  const role = (user?.role ?? 'operator') as UserRole;

  const visibleNav = navigation.filter((item) => canAccessRoute(role, item.href));
  const visibleBottom = bottomNav.filter((item) => canAccessRoute(role, item.href));

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex flex-col items-center gap-1 border-b border-card-border px-4 py-4">
        <VsproLogo size="sm" showSlogan={true} />
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleNav.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={close}
              className={clsx(
                'flex items-center gap-3 rounded-button px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary/15 text-accent border border-accent/20'
                  : 'text-muted-foreground hover:bg-card hover:text-white',
              )}
            >
              <span className="text-lg">{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Bottom nav */}
      {visibleBottom.length > 0 && (
        <div className="border-t border-card-border px-3 py-4">
          {visibleBottom.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={close}
              className="flex items-center gap-3 rounded-button px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-card hover:text-white transition-colors"
            >
              <span className="text-lg">{item.icon}</span>
              {item.name}
            </Link>
          ))}
        </div>
      )}

      {/* Rol indicator */}
      <div className="border-t border-card-border px-4 py-3">
        <span className="text-caption text-muted capitalize">Rol: {ROLE_LABELS[role] ?? role}</span>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar — hidden on mobile */}
      <aside className="hidden lg:flex w-64 flex-col vspro-sidebar">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={close}
          />
          {/* Drawer */}
          <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col vspro-sidebar shadow-2xl animate-slide-in">
            {/* Close button */}
            <button
              onClick={close}
              className="absolute right-3 top-3 rounded-full p-2 text-muted-foreground hover:bg-card hover:text-white transition-colors"
              aria-label="Cerrar menú"
            >
              ✕
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
