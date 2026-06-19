import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, UserRole } from '../decorators/roles.decorator';

/**
 * Guard que verifica que el usuario tiene uno de los roles requeridos.
 * Se usa junto con @Roles() decorator.
 *
 * Si no hay @Roles() en el endpoint, permite acceso a todos los roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
   * Role hierarchy mapping — new functional roles inherit access from base roles.
   * If an endpoint allows 'operator', it also allows produccion/delivery/vendedor/finanzas.
   * If an endpoint allows 'manager', it also allows all functional roles.
   */
  private readonly roleHierarchy: Record<string, UserRole[]> = {
    admin: ['admin'],
    manager: ['manager', 'vendedor', 'produccion', 'delivery', 'finanzas'],
    operator: ['operator', 'vendedor', 'produccion', 'delivery', 'finanzas'],
  };

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Sin @Roles() → acceso libre (otros guards manejan auth)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userRole = request.user?.role as UserRole;

    if (!userRole) {
      throw new ForbiddenException('No se pudo determinar el rol del usuario');
    }

    // Admin siempre tiene acceso a todo
    if (userRole === 'admin') return true;

    // Direct match
    if (requiredRoles.includes(userRole)) return true;

    // Hierarchy match: check if userRole is included via hierarchy expansion
    const expandedRoles = requiredRoles.flatMap(r => this.roleHierarchy[r] ?? [r]);
    if (expandedRoles.includes(userRole)) return true;

    throw new ForbiddenException({
      code: 'INSUFFICIENT_ROLE',
      message: `Tu rol (${userRole}) no tiene acceso a este recurso`,
      requiredRoles,
      currentRole: userRole,
    });
  }
}
