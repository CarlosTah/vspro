import { Module, Global } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryTelemetryService } from './sentry-telemetry.service';
import { LokiLoggerService } from './loki-logger.service';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * Telemetry Module — Global observability layer.
 *
 * Features:
 * - sentry-tenant-tracing: Error tracking with tenant context enrichment
 * - winston-loki-transport: Structured logs shipped to Grafana Loki
 * - bullmq-error-capture: Catches worker job failures
 *
 * Registered globally — available in all modules without import.
 */
@Global()
@Module({
  providers: [
    SentryTelemetryService,
    LokiLoggerService,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
  exports: [SentryTelemetryService, LokiLoggerService],
})
export class TelemetryModule {}
