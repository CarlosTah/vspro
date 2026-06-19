/**
 * Sistema de permisos por rol para el frontend.
 * Controla qué ve cada usuario en el sidebar y qué acciones puede realizar.
 *
 * Roles funcionales:
 * - admin: Dueño del negocio, acceso total
 * - vendedor: Atiende clientes, crea pedidos, ve conversaciones
 * - produccion: Prepara los pedidos, ve cola de producción y cocina
 * - delivery: Gestiona entregas y repartidores
 * - finanzas: Verifica pagos, ve reportes financieros
 */

export type UserRole = 'admin' | 'manager' | 'vendedor' | 'produccion' | 'delivery' | 'finanzas' | 'operator';

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
  canCreateOrders: boolean;
  canVerifyPayments: boolean;
  canManageDelivery: boolean;
  canViewConversations: boolean;
  canConfigureAI: boolean;
}

const PERMISSIONS: Record<UserRole, Permission> = {
  admin: {
    visibleRoutes: ['/', '/orders', '/production', '/kitchen', '/products', '/customers', '/conversations', '/payments', '/deliveries', '/reports', '/settings'],
    canCreateProducts: true,
    canManageStock: true,
    canViewBilling: true,
    canViewReports: true,
    canManageUsers: true,
    canViewAllOrders: true,
    canChangeOrderStatus: true,
    canCreateOrders: true,
    canVerifyPayments: true,
    canManageDelivery: true,
    canViewConversations: true,
    canConfigureAI: true,
  },
  manager: {
    visibleRoutes: ['/', '/orders', '/production', '/kitchen', '/products', '/customers', '/conversations', '/payments', '/deliveries', '/reports'],
    canCreateProducts: true,
    canManageStock: true,
    canViewBilling: false,
    canViewReports: true,
    canManageUsers: false,
    canViewAllOrders: true,
    canChangeOrderStatus: true,
    canCreateOrders: true,
    canVerifyPayments: true,
    canManageDelivery: true,
    canViewConversations: true,
    canConfigureAI: false,
  },
  vendedor: {
    visibleRoutes: ['/', '/orders', '/customers', '/conversations', '/products'],
    canCreateProducts: false,
    canManageStock: false,
    canViewBilling: false,
    canViewReports: false,
    canManageUsers: false,
    canViewAllOrders: true,
    canChangeOrderStatus: false,
    canCreateOrders: true,
    canVerifyPayments: false,
    canManageDelivery: false,
    canViewConversations: true,
    canConfigureAI: false,
  },
  produccion: {
    visibleRoutes: ['/', '/production', '/kitchen', '/orders'],
    canCreateProducts: false,
    canManageStock: false,
    canViewBilling: false,
    canViewReports: false,
    canManageUsers: false,
    canViewAllOrders: false,
    canChangeOrderStatus: true,
    canCreateOrders: false,
    canVerifyPayments: false,
    canManageDelivery: false,
    canViewConversations: false,
    canConfigureAI: false,
  },
  delivery: {
    visibleRoutes: ['/', '/deliveries', '/orders'],
    canCreateProducts: false,
    canManageStock: false,
    canViewBilling: false,
    canViewReports: false,
    canManageUsers: false,
    canViewAllOrders: false,
    canChangeOrderStatus: true,
    canCreateOrders: false,
    canVerifyPayments: false,
    canManageDelivery: true,
    canViewConversations: false,
    canConfigureAI: false,
  },
  finanzas: {
    visibleRoutes: ['/', '/payments', '/reports', '/orders'],
    canCreateProducts: false,
    canManageStock: false,
    canViewBilling: true,
    canViewReports: true,
    canManageUsers: false,
    canViewAllOrders: true,
    canChangeOrderStatus: false,
    canCreateOrders: false,
    canVerifyPayments: true,
    canManageDelivery: false,
    canViewConversations: false,
    canConfigureAI: false,
  },
  operator: {
    visibleRoutes: ['/', '/production'],
    canCreateProducts: false,
    canManageStock: false,
    canViewBilling: false,
    canViewReports: false,
    canManageUsers: false,
    canViewAllOrders: false,
    canChangeOrderStatus: true,
    canCreateOrders: false,
    canVerifyPayments: false,
    canManageDelivery: false,
    canViewConversations: false,
    canConfigureAI: false,
  },
};

/** Labels para mostrar en la UI */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  vendedor: 'Vendedor',
  produccion: 'Producción',
  delivery: 'Repartidor/Entregas',
  finanzas: 'Finanzas',
  operator: 'Operador',
};

/** Roles disponibles para invitar */
export const INVITABLE_ROLES: UserRole[] = ['manager', 'vendedor', 'produccion', 'delivery', 'finanzas'];

export function getPermissions(role: UserRole): Permission {
  return PERMISSIONS[role] ?? PERMISSIONS.operator;
}

export function canAccessRoute(role: UserRole, path: string): boolean {
  const perms = getPermissions(role);
  return perms.visibleRoutes.some(
    (route) => path === route || (route !== '/' && path.startsWith(route)),
  );
}
