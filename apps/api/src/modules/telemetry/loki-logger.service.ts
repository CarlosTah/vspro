import { Injectable, Logger, LoggerService, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelemetryContext } from '@vspro/shared';

/**
 * Loki Logger Service — Structured logging with Grafana Loki transport.
 *
 * Feature: winston-loki-transport
 *
 * Log format (JSON):
 * {
 *   timestamp, level, service, message,
 *   tenantSlug, schemaName, userId, agent, queue, jobId,
 *   duration, metadata
 * }
 *
 * In dev: pretty console output.
 * In prod: JSON → Loki (via winston-loki or promtail sidecar).
 *
 * Zero-waste: no Loki dependency in dev. Only structured format.
 */
@Injectable()
export class LokiLoggerService implements OnModuleInit {
  private readonly logger = new Logger(LokiLoggerService.name);
  private readonly serviceName: string;
  private lokiEnabled = false;

  constructor(private readonly config: ConfigService) {
    this.serviceName = this.config.get('SERVICE_NAME', 'vspro-api');
  }

  onModuleInit() {
    const lokiUrl = this.config.get('LOKI_URL');
    if (lokiUrl && lokiUrl !== 'CHANGE_ME') {
      this.lokiEnabled = true;
      this.logger.log(`Loki transport active: ${lokiUrl}`);
    }
  }

  /**
   * Structured info log with tenant context.
   */
  info(message: string, context?: TelemetryContext, metadata?: Record<string, any>): void {
    this.emit('info', message, context, metadata);
  }

  /**
   * Structured warn log.
   */
  warn(message: string, context?: TelemetryContext, metadata?: Record<string, any>): void {
    this.emit('warn', message, context, metadata);
  }

  /**
   * Structured error log.
   */
  error(message: string, error?: Error, context?: TelemetryContext): void {
    this.emit('error', message, context, {
      error: error ? { name: error.name, message: error.message, stack: error.stack?.split('\n').slice(0, 5) } : undefined,
    });
  }

  /**
   * Structured debug log (only in development).
   */
  debug(message: string, context?: TelemetryContext, metadata?: Record<string, any>): void {
    if (this.config.get('NODE_ENV') !== 'production') {
      this.emit('debug', message, context, metadata);
    }
  }

  /**
   * Log a BullMQ job event.
   */
  logJob(event: 'started' | 'completed' | 'failed', queue: string, jobId: string, context?: TelemetryContext, meta?: Record<string, any>): void {
    const level = event === 'failed' ? 'error' : 'info';
    this.emit(level, `Job ${event}: ${queue}/${jobId}`, { ...context, queue, jobId }, meta);
  }

  /**
   * Log with duration (for performance tracking).
   */
  logDuration(operation: string, durationMs: number, context?: TelemetryContext): void {
    const level = durationMs > 5000 ? 'warn' : 'info';
    this.emit(level, `${operation} completed in ${durationMs}ms`, context, { duration: durationMs });
  }

  // ─── Core Emit ────────────────────────────────────────────────

  private emit(level: string, message: string, context?: TelemetryContext, metadata?: Record<string, any>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      tenant: context?.tenantSlug,
      schema: context?.schemaName,
      user: context?.userId,
      agent: context?.agent,
      queue: context?.queue,
      jobId: context?.jobId,
      requestId: context?.requestId,
      ...metadata,
    };

    // Remove undefined keys (zero-waste)
    const clean = Object.fromEntries(Object.entries(entry).filter(([_, v]) => v !== undefined));

    if (this.lokiEnabled) {
      // In production: winston.log(clean) → Loki transport
      // Or: write to stdout as JSON (promtail picks up)
      process.stdout.write(JSON.stringify(clean) + '\n');
    } else {
      // Dev: use NestJS logger
      const prefix = context?.tenantSlug ? `[${context.tenantSlug}]` : '';
      const queuePrefix = context?.queue ? `[${context.queue}]` : '';
      switch (level) {
        case 'error': this.logger.error(`${prefix}${queuePrefix} ${message}`); break;
        case 'warn': this.logger.warn(`${prefix}${queuePrefix} ${message}`); break;
        case 'debug': this.logger.debug(`${prefix}${queuePrefix} ${message}`); break;
        default: this.logger.log(`${prefix}${queuePrefix} ${message}`);
      }
    }
  }
}
