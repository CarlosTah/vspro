import { TelemetryContext } from './telemetry.types';

/**
 * Creates a structured log entry with tenant context.
 * Used by both API and Worker for consistent log format.
 * Zero-waste: pure function, no dependencies.
 */
export function createTenantLogger(serviceName: string) {
  return {
    format(level: string, message: string, context?: TelemetryContext): string {
      const tenant = context?.tenantSlug ?? 'system';
      const prefix = context?.queue ? `[${context.queue}]` : '';
      return `[${serviceName}] [${tenant}] ${prefix} ${message}`;
    },

    structuredLog(level: string, message: string, context?: TelemetryContext, meta?: Record<string, any>) {
      return {
        timestamp: new Date().toISOString(),
        level,
        service: serviceName,
        message,
        ...context,
        ...meta,
      };
    },
  };
}
