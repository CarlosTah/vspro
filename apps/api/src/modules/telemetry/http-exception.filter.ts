import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { SentryTelemetryService } from './sentry-telemetry.service';

/**
 * Global HTTP Exception Filter — Captures all unhandled exceptions.
 *
 * Feature: bullmq-error-capture (also catches HTTP errors)
 *
 * Enriches errors with:
 * - Tenant context from request headers / JWT
 * - Request path and method
 * - User ID from JWT payload
 *
 * Returns standardized error response:
 * { statusCode, message, error, timestamp, path, requestId }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly telemetry: SentryTelemetryService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException
      ? exception.message
      : 'Internal server error';

    const errorResponse = exception instanceof HttpException
      ? exception.getResponse()
      : { message };

    // Extract tenant context from request
    const tenantSlug = (request.headers['x-tenant-slug'] as string) ?? (request as any).tenant?.slug;
    const userId = (request as any).user?.sub;
    const requestId = (request.headers['x-request-id'] as string) ?? this.generateRequestId();

    // Only report 5xx to Sentry (not 4xx client errors)
    if (status >= 500) {
      const error = exception instanceof Error ? exception : new Error(message);
      this.telemetry.captureError(error, {
        tenantSlug,
        userId,
        requestId,
      });
    }

    // Log all errors (4xx at warn level, 5xx at error)
    const logLevel = status >= 500 ? 'error' : 'warn';
    this.logger[logLevel](
      `[${tenantSlug ?? 'no-tenant'}] ${request.method} ${request.url} → ${status} ${message}`,
    );

    // Standardized error response
    const body = {
      statusCode: status,
      message: typeof errorResponse === 'object' ? (errorResponse as any).message ?? message : message,
      error: typeof errorResponse === 'object' ? (errorResponse as any).error : undefined,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    };

    response.status(status).json(body);
  }

  private generateRequestId(): string {
    return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
