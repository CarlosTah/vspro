import { SetMetadata } from '@nestjs/common';

/**
 * Tipos de uso que se rastrean contra las quotas del plan.
 * Cada tipo corresponde a un campo en la tabla usage_records.
 */
export type UsageType = 'orders' | 'messages' | 'ai' | 'ocr';

export const TRACK_USAGE_KEY = 'track_usage';

/**
 * Marca un endpoint para que incremente el contador de uso del tenant.
 * El QuotaGuard verifica ANTES de ejecutar si hay quota disponible.
 * El UsageInterceptor incrementa DESPUÉS de ejecutar exitosamente.
 *
 * Uso:
 *   @TrackUsage('orders')
 *   @Post()
 *   createOrder() { ... }
 */
export const TrackUsage = (type: UsageType) => SetMetadata(TRACK_USAGE_KEY, type);
