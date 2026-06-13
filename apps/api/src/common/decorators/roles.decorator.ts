import { SetMetadata } from '@nestjs/common';

/**
 * Roles disponibles en el sistema.
 * - admin: acceso total al tenant
 * - manager: gestión de pedidos, productos, clientes, reportes
 * - operator: solo producción y pedidos asignados
 */
export type UserRole = 'admin' | 'manager' | 'operator';

export const ROLES_KEY = 'roles';

/**
 * Restringe un endpoint a uno o más roles.
 *
 * Uso:
 *   @Roles('admin', 'manager')
 *   @UseGuards(AuthGuard('jwt'), RolesGuard)
 *   @Get('reports')
 *   getReports() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
