import {
  Injectable,
  NestMiddleware,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const tenantSlug = this.resolveTenantSlug(req);

    if (!tenantSlug) {
      return next(); // ruta pública sin tenant
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: {
        plan: true,
        subscription: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant '${tenantSlug}' no encontrado`);
    }

    if (tenant.status === 'SUSPENDED') {
      throw new ForbiddenException({
        code: 'TENANT_SUSPENDED',
        message: 'Tu cuenta está suspendida por falta de pago.',
        reactivateUrl: `https://app.vspro.app/billing`,
      });
    }

    if (tenant.status === 'CANCELLED') {
      throw new ForbiddenException({
        code: 'TENANT_CANCELLED',
        message: 'Esta cuenta ha sido cancelada.',
      });
    }

    // Inyectar tenant en el request para uso en controllers y services
    (req as any).tenant = tenant;

    this.logger.debug(`Tenant resuelto: ${tenant.slug} [${tenant.schemaName}]`);
    next();
  }

  /**
   * Resuelve el slug del tenant desde el subdominio o header.
   *
   * Estrategia 1 (producción): subdominio
   *   tortilleria.vspro.app → "tortilleria"
   *
   * Estrategia 2 (desarrollo/webhooks): header x-tenant-slug
   *   Útil para tests y para webhooks de Meta que no usan subdominios
   */
  private resolveTenantSlug(req: Request): string | null {
    // Header explícito tiene prioridad (útil en tests y webhooks)
    const headerSlug = req.headers['x-tenant-slug'] as string;
    if (headerSlug) return headerSlug;

    // Subdominio
    const host = req.hostname ?? '';
    const parts = host.split('.');

    // Ignorar hosts sin subdominio o con subdominios reservados
    const reservedSubdomains = ['www', 'app', 'api', 'staging', 'localhost'];
    if (parts.length >= 3 && !reservedSubdomains.includes(parts[0])) {
      return parts[0];
    }

    return null;
  }
}
