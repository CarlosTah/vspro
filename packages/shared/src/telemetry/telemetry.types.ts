/**
 * Shared telemetry types — used by both API and Worker.
 * Zero-waste: only types, no runtime code in shared package.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

export interface TelemetryContext {
  tenantId?: string;
  tenantSlug?: string;
  schemaName?: string;
  userId?: string;
  conversationId?: string;
  orderId?: string;
  requestId?: string;
  agent?: string;
  queue?: string;
  jobId?: string;
}

export interface TelemetryConfig {
  sentryDsn?: string;
  lokiUrl?: string;
  environment: string;
  serviceName: string;
  logLevel: LogLevel;
}

export interface TelemetryEvent {
  level: LogLevel;
  message: string;
  context: TelemetryContext;
  timestamp: string;
  error?: { name: string; message: string; stack?: string };
  duration?: number;
  metadata?: Record<string, any>;
}
