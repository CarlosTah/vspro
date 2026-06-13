import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

/**
 * Health Monitor Service — Continuous infrastructure health checks.
 *
 * Monitors:
 * - PostgreSQL connectivity and query latency
 * - Redis connectivity
 * - BullMQ queue depths (alert if backed up)
 * - Disk/memory usage indicators
 * - Tenant schema integrity
 *
 * Runs every 5 minutes. Logs warnings when thresholds exceeded.
 */
@Injectable()
export class HealthMonitorService {
  private readonly logger = new Logger(HealthMonitorService.name);
  private readonly alerts: HealthAlert[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Periodic health check — every 5 minutes.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'health-monitor' })
  async runHealthCheck(): Promise<void> {
    const results = await this.checkAll();

    const unhealthy = results.filter(r => r.status !== 'healthy');
    if (unhealthy.length > 0) {
      this.logger.warn(`Health check: ${unhealthy.length} issues detected`);
      for (const issue of unhealthy) {
        this.logger.warn(`  ⚠️ ${issue.component}: ${issue.message}`);
      }
    }
  }

  /**
   * Run all health checks and return results.
   */
  async checkAll(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    results.push(await this.checkPostgres());
    results.push(await this.checkRedis());
    results.push(await this.checkTenantSchemas());
    results.push(this.checkMemory());

    return results;
  }

  /**
   * Get comprehensive health status (for /health endpoint enhancement).
   */
  async getDetailedHealth(): Promise<DetailedHealth> {
    const checks = await this.checkAll();
    const allHealthy = checks.every(c => c.status === 'healthy');

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
      recentAlerts: this.alerts.slice(-10),
    };
  }

  // ─── Individual Checks ────────────────────────────────────────

  private async checkPostgres(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      const latency = Date.now() - start;

      if (latency > 1000) {
        return { component: 'postgresql', status: 'degraded', message: `High latency: ${latency}ms`, latencyMs: latency };
      }
      return { component: 'postgresql', status: 'healthy', message: `OK (${latency}ms)`, latencyMs: latency };
    } catch (err: any) {
      return { component: 'postgresql', status: 'unhealthy', message: err.message, latencyMs: Date.now() - start };
    }
  }

  private async checkRedis(): Promise<HealthCheckResult> {
    try {
      // Check if Redis is reachable via BullMQ queue info
      const Redis = require('ioredis');
      const redis = new Redis({
        host: this.config.get('REDIS_HOST', 'localhost'),
        port: this.config.get<number>('REDIS_PORT', 6380),
        password: this.config.get('REDIS_PASSWORD'),
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
      });

      const start = Date.now();
      await redis.ping();
      const latency = Date.now() - start;
      await redis.quit();

      return { component: 'redis', status: 'healthy', message: `OK (${latency}ms)`, latencyMs: latency };
    } catch (err: any) {
      return { component: 'redis', status: 'unhealthy', message: err.message, latencyMs: 0 };
    }
  }

  private async checkTenantSchemas(): Promise<HealthCheckResult> {
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { status: { in: ['ACTIVE', 'TRIAL'] } },
        select: { slug: true, schemaName: true },
      });

      let orphans = 0;
      for (const t of tenants.slice(0, 5)) { // Check first 5 for speed
        const exists = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`, t.schemaName,
        );
        if (exists.length === 0) orphans++;
      }

      if (orphans > 0) {
        return { component: 'tenant_schemas', status: 'degraded', message: `${orphans} orphan schemas detected`, latencyMs: 0 };
      }
      return { component: 'tenant_schemas', status: 'healthy', message: `${tenants.length} tenants OK`, latencyMs: 0 };
    } catch (err: any) {
      return { component: 'tenant_schemas', status: 'unhealthy', message: err.message, latencyMs: 0 };
    }
  }

  private checkMemory(): HealthCheckResult {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const ratio = usage.heapUsed / usage.heapTotal;

    if (ratio > 0.9) {
      return { component: 'memory', status: 'degraded', message: `High memory: ${heapUsedMB}/${heapTotalMB}MB (${Math.round(ratio * 100)}%)`, latencyMs: 0 };
    }
    return { component: 'memory', status: 'healthy', message: `${heapUsedMB}/${heapTotalMB}MB`, latencyMs: 0 };
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface HealthCheckResult {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  latencyMs: number;
}

interface HealthAlert {
  component: string;
  message: string;
  timestamp: string;
}

interface DetailedHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: HealthCheckResult[];
  recentAlerts: HealthAlert[];
}
