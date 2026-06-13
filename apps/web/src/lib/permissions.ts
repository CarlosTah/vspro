/**
 * Sistema de permisos por rol para el frontend.
 * Controla qué ve cada usuario en el sidebar y qué acciones puede realizar.
 */

export type UserRole = 'admin' | 'manager' | 'operator';

export interface Permission {
  /** Rutas del sidebar visibles para este rol */
  visibleRoutes: string[];
  /** Acciones permitidas */
  canCreateProducts: boolean;
  canManageStock: boolean;
  canViewBilling: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
  canViewAllOrders: boolean;
  canChangeOrderStatus: boolean;
}

const PERMISSIONS: Record<UserRole, Permission> = {
  admin: {
    visibleRoutes: ['/', '/orders', '/production', '/products', '/customers', '/conversations', '/payments', '/settings'],
    canCreateProducts: true,
    canManageStock: true,
    canViewBilling: true,
    canViewReports: true,
    canManageUsers: true,
    canViewAllOrders: true,
    canChangeOrderStatus: true,
  },
  manager: {
    visibleRoutes: ['/', '/orders', '/production', '/products', '/customers', '/conversations', '/payments'],
    canCreateProducts: true,
    canManageStock: true,
    canViewBilling: false,
    canViewReports: true,
    canManageUsers: false,
    canViewAllOrders: true,
    canChangeOrderStatus: true,
  },
  operator: {
    visibleRoutes: ['/', '/production'],
    canCreateProducts: false,
    canManageStock: false,
    canViewBilling: false,
    canViewReports: false,
    canManageUsers: false,
    canViewAllOrders: false,
    canChangeOrderStatus: true, // solo los asignados a él
  },
};

export function getPermissions(role: UserRole): Permission {
  return PERMISSIONS[role] ?? PERMISSIONS.operator;
}

export function canAccessRoute(role: UserRole, path: string): boolean {
  const perms = getPermissions(role);
  return perms.visibleRoutes.some(
    (route) => path === route || (route !== '/' && path.startsWith(route)),
  );
}
