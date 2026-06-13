import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TRACK_USAGE_KEY, UsageType } from '../decorators/track-usage.decorator';
import { QuotaService } from '../../modules/billing/quota.service';

/**
 * Guard que verifica la quota del tenant ANTES de ejecutar el endpoint.
 * Si el tenant excedió su límite, retorna 403 con código QUOTA_EXCEEDED.
 *
 * Se activa automáticamente en endpoints marcados con @TrackUsage().
 */
@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(QuotaService) private readonly quotaService: QuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const usageType = this.reflector.getAllAndOverride<UsageType>(
      TRACK_USAGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si el endpoint no tiene @TrackUsage(), no aplica quota
    if (!usageType) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId;

    if (!tenantId) return true; // sin tenant resuelto, dejar pasar (otro guard lo bloqueará)

    const { allowed, current, limit } = await this.quotaService.checkQuota(tenantId, usageType);

    if (!allowed) {
      throw new ForbiddenException({
        code: 'QUOTA_EXCEEDED',
        message: `Has alcanzado el límite de tu plan para ${usageType} (${current}/${limit} este mes).`,
        usageType,
        current,
        limit,
        upgradeUrl: '/billing/checkout',
      });
    }

    return true;
  }
}
