import { SetMetadata } from '@nestjs/common';

/**
 * Roles disponibles en el sistema.
 * - admin: acceso total al tenant (dueño)
 * - manager: gestión completa sin billing ni config
 * - vendedor: atención a clientes, pedidos, conversaciones
 * - produccion: cola de producción, cocina, avanzar pedidos
 * - delivery: gestión de entregas y repartidores
 * - finanzas: pagos, verificación, reportes financieros
 * - operator: legacy, solo producción
 */
export type UserRole = 'admin' | 'manager' | 'vendedor' | 'produccion' | 'delivery' | 'finanzas' | 'operator';

export const ROLES_KEY = 'roles';

/**
 * Restringe un endpoint a uno o más roles.
 *
 * Uso:
 *   @Roles('admin', 'manager', 'vendedor')
 *   @UseGuards(AuthGuard('jwt'), RolesGuard)
 *   @Get('orders')
 *   getOrders() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
