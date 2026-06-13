import { Injectable, Logger } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';

/**
 * Failover Indicator — Manages degraded mode and queue buffering.
 *
 * Feature: degraded-queue-buffering
 *
 * When critical services are down (OpenAI, Redis, Meta API):
 * - Activates degraded mode for affected capabilities
 * - Buffers non-critical operations for retry
 * - Returns fallback responses instead of errors
 * - Tracks time-in-degraded for SLA reporting
 *
 * Degraded modes:
 * - ai_degraded: AI unavailable → use canned responses
 * - messaging_degraded: Meta API down → queue messages for later
 * - cache_degraded: Redis down → skip caching, hit DB directly
 * - payments_degraded: OCR unavailable → queue for manual review
 */
@Injectable()
export class FailoverIndicator {
  private readonly logger = new Logger(FailoverIndicator.name);
  private readonly degradedSince = new Map<string, number>();

  constructor(private readonly circuitBreaker: CircuitBreakerService) {}

  /**
   * Check if a capability is currently degraded.
   */
  isDegraded(capability: DegradedCapability): boolean {
    const serviceMap: Record<DegradedCapability, string> = {
      ai_degraded: 'openai',
      messaging_degraded: 'meta-api',
      cache_degraded: 'redis',
      payments_degraded: 'openai-vision',
    };

    const service = serviceMap[capability];
    return !this.circuitBreaker.canExecute(service);
  }

  /**
   * Get fallback response for a degraded capability.
   */
  getFallback(capability: DegradedCapability): string {
    const fallbacks: Record<DegradedCapability, string> = {
      ai_degraded: 'Disculpa, nuestro asistente está temporalmente fuera de servicio. Un agente humano te atenderá pronto. 🙏',
      messaging_degraded: 'Tu mensaje fue recibido pero la entrega está retrasada. Reintentaremos automáticamente.',
      cache_degraded: '', // Silent degradation — no user impact
      payments_degraded: 'Recibimos tu comprobante. La verificación automática no está disponible en este momento, lo revisaremos manualmente.',
    };
    return fallbacks[capability];
  }

  /**
   * Enter degraded mode for a capability.
   */
  enterDegraded(capability: DegradedCapability): void {
    if (!this.degradedSince.has(capability)) {
      this.degradedSince.set(capability, Date.now());
      this.logger.warn(`⚠️ DEGRADED MODE: ${capability} activated`);
    }
  }

  /**
   * Exit degraded mode (service recovered).
   */
  exitDegraded(capability: DegradedCapability): void {
    const since = this.degradedSince.get(capability);
    if (since) {
      const duration = Date.now() - since;
      this.degradedSince.delete(capability);
      this.logger.log(`✅ RECOVERED: ${capability} (was degraded for ${Math.round(duration / 1000)}s)`);
    }
  }

  /**
   * Get overall system status.
   */
  getSystemStatus(): SystemStatus {
    const capabilities: DegradedCapability[] = ['ai_degraded', 'messaging_degraded', 'cache_degraded', 'payments_degraded'];
    const degraded = capabilities.filter(c => this.isDegraded(c));
    const circuits = this.circuitBreaker.getStatus();

    return {
      overall: degraded.length === 0 ? 'operational' : degraded.length <= 1 ? 'degraded' : 'major_outage',
      degradedCapabilities: degraded,
      circuits,
      degradedSince: Object.fromEntries(
        [...this.degradedSince.entries()].map(([k, v]) => [k, new Date(v).toISOString()]),
      ),
    };
  }

  /**
   * Wrap an async operation with circuit breaker + fallback.
   */
  async withFallback<T>(
    serviceName: string,
    capability: DegradedCapability,
    operation: () => Promise<T>,
    fallbackValue: T,
  ): Promise<T> {
    if (!this.circuitBreaker.canExecute(serviceName)) {
      this.enterDegraded(capability);
      return fallbackValue;
    }

    try {
      const result = await operation();
      this.circuitBreaker.recordSuccess(serviceName);
      this.exitDegraded(capability);
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure(serviceName);
      this.enterDegraded(capability);
      return fallbackValue;
    }
  }
}

// ─── Types ──────────────────────────────────────────────────────

type DegradedCapability = 'ai_degraded' | 'messaging_degraded' | 'cache_degraded' | 'payments_degraded';

interface SystemStatus {
  overall: 'operational' | 'degraded' | 'major_outage';
  degradedCapabilities: string[];
  circuits: Record<string, any>;
  degradedSince: Record<string, string>;
}
