import { SetMetadata } from '@nestjs/common';
import { PlanFeatures } from '@vspro/shared';

export const FEATURE_KEY = 'require_feature';

/**
 * Marca un endpoint como requiriendo una feature específica del plan.
 * El PlanFeatureGuard verifica que el plan del tenant incluya la feature.
 *
 * Uso:
 *   @RequireFeature('advancedReports')
 *   @Get('reports/advanced')
 *   getAdvancedReports() { ... }
 */
export const RequireFeature = (feature: keyof PlanFeatures) => SetMetadata(FEATURE_KEY, feature);
