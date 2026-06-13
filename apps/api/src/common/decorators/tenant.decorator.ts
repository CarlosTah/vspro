import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '@vspro/shared';

/**
 * Extrae el tenant del request.
 * Uso: @CurrentTenant() tenant: TenantContext
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenant;
  },
);

/**
 * Extrae solo el schemaName del tenant.
 * Uso: @TenantSchema() schema: string
 */
export const TenantSchema = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenant?.schemaName;
  },
);
