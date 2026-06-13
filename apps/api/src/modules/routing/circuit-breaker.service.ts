import { Injectable, Logger } from '@nestjs/common';

/**
 * Circuit Breaker Service — Protects against cascading failures.
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED
 *
 * When a service (OpenAI, Redis, external API) fails repeatedly:
 * 1. CLOSED: Normal operation, requests pass through
 * 2. OPEN: Too many failures — requests fail-fast without calling the service
 * 3. HALF_OPEN: After cooldown, let 1 request through to test recovery
 *
 * Each circuit is identified by a service name (e.g., 'openai', 'redis', 'meta-api').
 * Zero-waste: no external dependencies, pure state machine.
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitState>();

  private readonly FAILURE_THRESHOLD = 5;      // Failures before opening
  private readonly COOLDOWN_MS = 30_000;       // 30s before half-open
  private readonly SUCCESS_THRESHOLD = 2;      // Successes in half-open before closing

  /**
   * Check if a service call is allowed.
   */
  canExecute(serviceName: string): boolean {
    const circuit = this.getOrCreate(serviceName);

    switch (circuit.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if cooldown expired → move to half-open
        if (Date.now() - circuit.lastFailureAt > this.COOLDOWN_MS) {
          circuit.state = 'half_open';
          circuit.halfOpenAttempts = 0;
          this.logger.log(`Circuit ${serviceName}: OPEN → HALF_OPEN (cooldown expired)`);
          return true;
        }
        return false;

      case 'half_open':
        // Allow limited requests in half-open
        return circuit.halfOpenAttempts < 1;
    }
  }

  /**
   * Record a successful call.
   */
  recordSuccess(serviceName: string): void {
    const circuit = this.getOrCreate(serviceName);

    if (circuit.state === 'half_open') {
      circuit.halfOpenSuccesses++;
      if (circuit.halfOpenSuccesses >= this.SUCCESS_THRESHOLD) {
        circuit.state = 'closed';
        circuit.failures = 0;
        this.logger.log(`Circuit ${serviceName}: HALF_OPEN → CLOSED (recovered)`);
      }
    } else if (circuit.state === 'closed') {
      circuit.failures = Math.max(0, circuit.failures - 1); // Gradual recovery
    }
  }

  /**
   * Record a failed call.
   */
  recordFailure(serviceName: string): void {
    const circuit = this.getOrCreate(serviceName);
    circuit.failures++;
    circuit.lastFailureAt = Date.now();
    circuit.totalFailures++;

    if (circuit.state === 'half_open') {
      circuit.state = 'open';
      this.logger.warn(`Circuit ${serviceName}: HALF_OPEN → OPEN (still failing)`);
    } else if (circuit.state === 'closed' && circuit.failures >= this.FAILURE_THRESHOLD) {
      circuit.state = 'open';
      this.logger.warn(`Circuit ${serviceName}: CLOSED → OPEN (${circuit.failures} failures)`);
    }
  }

  /**
   * Get status of all circuits (for dashboard/health).
   */
  getStatus(): Record<string, CircuitStatus> {
    const status: Record<string, CircuitStatus> = {};
    for (const [name, circuit] of this.circuits) {
      status[name] = {
        state: circuit.state,
        failures: circuit.failures,
        totalFailures: circuit.totalFailures,
        lastFailureAt: circuit.lastFailureAt ? new Date(circuit.lastFailureAt).toISOString() : null,
      };
    }
    return status;
  }

  /**
   * Force reset a circuit (admin action).
   */
  reset(serviceName: string): void {
    this.circuits.delete(serviceName);
    this.logger.log(`Circuit ${serviceName}: manually reset`);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private getOrCreate(name: string): CircuitState {
    if (!this.circuits.has(name)) {
      this.circuits.set(name, {
        state: 'closed',
        failures: 0,
        totalFailures: 0,
        lastFailureAt: 0,
        halfOpenAttempts: 0,
        halfOpenSuccesses: 0,
      });
    }
    return this.circuits.get(name)!;
  }
}

// ─── Types ──────────────────────────────────────────────────────

interface CircuitState {
  state: 'closed' | 'open' | 'half_open';
  failures: number;
  totalFailures: number;
  lastFailureAt: number;
  halfOpenAttempts: number;
  halfOpenSuccesses: number;
}

interface CircuitStatus {
  state: string;
  failures: number;
  totalFailures: number;
  lastFailureAt: string | null;
}
