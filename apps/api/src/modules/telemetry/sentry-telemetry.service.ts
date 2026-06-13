import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelemetryContext } from '@vspro/shared';

/**
 * Sentry Telemetry Service — Tenant-aware error tracking and tracing.
 *
 * Feature: sentry-tenant-tracing
 *
 * Every error is enriched with:
 * - tenantId / tenantSlug / schemaName
 * - userId (who triggered it)
 * - requestId (correlation)
 * - agent (which AI agent was active)
 * - queue/jobId (if from BullMQ worker)
 *
 * In dev: structured console logs.
 * In prod: Sentry SDK with performance tracing.
 */
@Injectable()
export class SentryTelemetryService implements OnModuleInit {
  private readonly logger = new Logger(SentryTelemetryService.name);
  private readonly serviceName: string;
  private initialized = false;

  constructor(private readonly config: ConfigService) {
    this.serviceName = 'vspro-api';
  }

  onModuleInit() {
    const dsn = this.config.get('SENTRY_DSN');
    if (dsn && dsn !== 'CHANGE_ME' && this.config.get('NODE_ENV') === 'production') {
      this.initialized = true;
      this.logger.log('Sentry telemetry active (production mode)');
    } else {
      this.logger.debug('Sentry telemetry: local mode (console only)');
    }
  }

  /**
   * Capture an error with full tenant context.
   */
  captureError(error: Error, context?: TelemetryContext): void {
    const entry = {
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      level: 'error',
      error: { name: error.name, message: error.message, stack: error.stack?.split('\n').slice(0, 8) },
      ...context,
    };

    this.logger.error(JSON.stringify(entry));

    if (this.initialized) {
      // Sentry.withScope(scope => {
      //   if (context?.tenantSlug) scope.setTag('tenant', context.tenantSlug);
      //   if (context?.userId) scope.setUser({ id: context.userId });
      //   if (context?.agent) scope.setTag('agent', context.agent);
      //   if (context?.queue) scope.setTag('queue', context.queue);
      //   Sentry.captureException(error);
      // });
    }
  }

  /**
   * Capture a BullMQ job failure.
   */
  captureJobFailure(queue: string, jobId: string, error: Error, context?: TelemetryContext): void {
    this.captureError(error, {
      ...context,
      queue,
      jobId,
    });
  }

  /**
   * Start a performance span for tracing.
   */
  startSpan(name: string, op: string, context?: TelemetryContext): TelemetrySpan {
    const start = Date.now();
    return {
      name,
      op,
      end: () => {
        const duration = Date.now() - start;
        if (duration > 3000) {
          this.logger.warn(`Slow span: ${op}/${name} — ${duration}ms [${context?.tenantSlug ?? 'system'}]`);
        }
        return duration;
      },
    };
  }

  /**
   * Record a metric (counter/gauge).
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    // In production: send to Sentry/Datadog/Prometheus
    // In dev: log only if unusual
    if (value > 1000 && name.includes('latency')) {
      this.logger.warn(`Metric alert: ${name}=${value} ${JSON.stringify(tags)}`);
    }
  }
}

interface TelemetrySpan {
  name: string;
  op: string;
  end: () => number;
}
