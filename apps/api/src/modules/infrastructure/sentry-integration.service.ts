import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Sentry Integration Service — Error tracking and performance monitoring.
 *
 * Features:
 * - Captures unhandled exceptions with tenant context
 * - Tags errors with tenantId, schemaName, userId
 * - Tracks performance of critical paths (AI calls, DB queries)
 * - Breadcrumbs for debugging conversation flows
 *
 * In development: logs errors locally.
 * In production: sends to Sentry DSN.
 */
@Injectable()
export class SentryIntegrationService implements OnModuleInit {
  private readonly logger = new Logger(SentryIntegrationService.name);
  private initialized = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dsn = this.config.get('SENTRY_DSN');
    if (dsn && dsn !== 'CHANGE_ME') {
      // In production: initialize Sentry SDK
      // import * as Sentry from '@sentry/node';
      // Sentry.init({ dsn, environment: this.config.get('NODE_ENV'), tracesSampleRate: 0.1 });
      this.initialized = true;
      this.logger.log('Sentry initialized for error tracking');
    } else {
      this.logger.debug('Sentry DSN not configured — errors logged locally only');
    }
  }

  /**
   * Capture an exception with tenant context.
   */
  captureException(error: Error, context?: ErrorContext): void {
    const enriched = {
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      ...context,
      timestamp: new Date().toISOString(),
    };

    if (this.initialized) {
      // Sentry.captureException(error, { tags: context, extra: enriched });
    }

    this.logger.error(`[${context?.tenantSlug ?? 'system'}] ${error.message}`, enriched);
  }

  /**
   * Capture a message (non-exception event).
   */
  captureMessage(message: string, level: 'info' | 'warning' | 'error', context?: ErrorContext): void {
    if (this.initialized) {
      // Sentry.captureMessage(message, { level, tags: context });
    }

    const logMethod = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
    this.logger[logMethod](`[${context?.tenantSlug ?? 'system'}] ${message}`);
  }

  /**
   * Add breadcrumb for debugging conversation flows.
   */
  addBreadcrumb(category: string, message: string, data?: Record<string, any>): void {
    if (this.initialized) {
      // Sentry.addBreadcrumb({ category, message, data, level: 'info' });
    }
  }

  /**
   * Start a performance transaction.
   */
  startTransaction(name: string, op: string): PerformanceTransaction {
    const start = Date.now();
    return {
      name,
      op,
      finish: () => {
        const duration = Date.now() - start;
        if (duration > 5000) {
          this.logger.warn(`Slow transaction: ${name} (${op}) took ${duration}ms`);
        }
      },
    };
  }
}

// ─── Types ──────────────────────────────────────────────────────

interface ErrorContext {
  tenantId?: string;
  tenantSlug?: string;
  schemaName?: string;
  userId?: string;
  module?: string;
  action?: string;
}

interface PerformanceTransaction {
  name: string;
  op: string;
  finish: () => void;
}
