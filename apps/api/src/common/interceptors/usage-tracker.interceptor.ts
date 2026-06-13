import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { TRACK_USAGE_KEY, UsageType } from '../decorators/track-usage.decorator';
import { QuotaService } from '../../modules/billing/quota.service';

/**
 * Interceptor que incrementa el contador de uso DESPUÉS de que
 * el endpoint se ejecutó exitosamente (HTTP 2xx).
 *
 * Solo actúa en endpoints marcados con @TrackUsage().
 * Si el endpoint lanza un error, NO se incrementa el contador.
 */
@Injectable()
export class UsageTrackerInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(QuotaService) private readonly quotaService: QuotaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const usageType = this.reflector.getAllAndOverride<UsageType>(
      TRACK_USAGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!usageType) return next.handle();

    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId;

    if (!tenantId) return next.handle();

    // Ejecutar el handler y solo incrementar si fue exitoso
    return next.handle().pipe(
      tap(() => {
        // Fire-and-forget: no bloquear la respuesta por el incremento
        this.quotaService.increment(tenantId, usageType).catch((err) => {
          // Log pero no fallar — el incremento no es crítico
          console.error(`Error incrementando quota ${usageType} para ${tenantId}:`, err);
        });
      }),
    );
  }
}
