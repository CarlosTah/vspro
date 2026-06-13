import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { PlanFeatures } from '@vspro/shared';

@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredFeature = this.reflector.getAllAndOverride<keyof PlanFeatures>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeature) return true; // sin restricción de feature

    const request = context.switchToHttp().getRequest();
    const tenant = request.tenant;

    if (!tenant?.plan?.features) {
      throw new ForbiddenException('No se pudo verificar el plan del tenant');
    }

    const features = tenant.plan.features as PlanFeatures;
    const hasFeature = features[requiredFeature];

    if (!hasFeature) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_IN_PLAN',
        message: `Tu plan actual no incluye esta función (${String(requiredFeature)}).`,
        feature: requiredFeature,
        upgradeUrl: 'https://app.vspro.app/billing/upgrade',
      });
    }

    return true;
  }
}
