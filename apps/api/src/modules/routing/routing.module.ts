import { Module, Global } from '@nestjs/common';
import { DomainRouterGateway } from './domain-router.gateway';
import { CircuitBreakerService } from './circuit-breaker.service';
import { FailoverIndicator } from './failover-indicator.service';

/**
 * Routing & Failover Module — Domain resolution + circuit breaking + degraded mode.
 *
 * Features:
 * - nginx-wildcard-headers: Resolves tenant from Host header (*.vspro.mx)
 * - tenant-host-resolution: Maps subdomain/header to schema
 * - degraded-queue-buffering: Buffers requests when services are down
 *
 * Registered globally — intercepted before all routes.
 */
@Global()
@Module({
  providers: [DomainRouterGateway, CircuitBreakerService, FailoverIndicator],
  exports: [DomainRouterGateway, CircuitBreakerService, FailoverIndicator],
})
export class RoutingModule {}
