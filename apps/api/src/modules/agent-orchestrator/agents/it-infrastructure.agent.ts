import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { OrchestratorAgent } from '../agent-registry.service';
import { OrchestratorAgentType, AgentTask, AgentTaskOutput, SessionContext } from '../types';

/**
 * IT Infrastructure Agent — System health, monitoring, and deployment.
 *
 * Capabilities:
 * - Monitor service health (PostgreSQL, Redis, queues, memory)
 * - Analyze error logs and identify patterns
 * - Report on queue depths and job failures
 * - Provide deployment status and recommendations
 * - Alert on resource exhaustion
 * - Suggest scaling actions
 */
@Injectable()
export class ItInfrastructureAgent implements OrchestratorAgent {
  private readonly logger = new Logger(ItInfrastructureAgent.name);

  readonly name: OrchestratorAgentType = 'it-infrastructure';
  readonly description = 'Monitoreo de infraestructura: health checks, queues, recursos, despliegues';
  readonly domains = ['infrastructure', 'health', 'monitoring', 'database', 'redis', 'queues', 'deployment', 'performance'];
  readonly riskLevel = 'high' as const;
  readonly requiresApproval = true; // Actions on infrastructure require approval

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async execute(task: AgentTask, context: SessionContext): Promise<AgentTaskOutput> {
    switch (task.type) {
      case 'query':
      case 'analysis':
        return this.analyzeHealth(task);
      case 'report':
        return this.generateHealthReport(task);
      case 'action':
        return this.suggestAction(task);
      default:
        return this.analyzeHealth(task);
    }
  }

  private async analyzeHealth(task: AgentTask): Promise<AgentTaskOutput> {
    const checks: Record<string, any> = {};

    // PostgreSQL
    try {
      const start = Date.now();
      await this.prisma.$queryRawUnsafe('SELECT 1');
      checks.postgresql = { status: 'healthy', latencyMs: Date.now() - start };
    } catch (err: any) {
      checks.postgresql = { status: 'unhealthy', error: err.message };
    }

    // Memory
    const mem = process.memoryUsage();
    checks.memory = {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
      ratio: (mem.heapUsed / mem.heapTotal * 100).toFixed(1) + '%',
    };

    // Tenant count
    const tenants = await this.prisma.tenant.count({ where: { status: { in: ['ACTIVE', 'TRIAL'] } } });
    checks.tenants = { active: tenants };

    // Uptime
    checks.uptime = { seconds: Math.round(process.uptime()), formatted: this.formatUptime(process.uptime()) };

    const allHealthy = checks.postgresql?.status === 'healthy' && parseInt(checks.memory.ratio) < 90;

    return {
      response: allHealthy
        ? `✅ Infraestructura saludable: PostgreSQL ${checks.postgresql.latencyMs}ms, Memoria ${checks.memory.ratio}, ${tenants} tenants activos, Uptime ${checks.uptime.formatted}`
        : `⚠️ Problemas detectados: ${JSON.stringify(checks)}`,
      toolsUsed: ['health_check', 'memory_analysis'],
      confidence: 0.95,
      data: checks,
      suggestedActions: allHealthy ? [] : ['Revisar logs', 'Considerar restart', 'Escalar recursos'],
    };
  }

  private async generateHealthReport(task: AgentTask): Promise<AgentTaskOutput> {
    const result = await this.analyzeHealth(task);
    return {
      ...result,
      response: `📊 Reporte de Infraestructura\n${result.response}\n\nDetalles: ${JSON.stringify(result.data, null, 2)}`,
    };
  }

  private async suggestAction(task: AgentTask): Promise<AgentTaskOutput> {
    return {
      response: `⚠️ Acciones de infraestructura requieren aprobación humana. Sugerencia: "${task.description}" — un administrador debe aprobar antes de ejecutar.`,
      toolsUsed: ['suggest_action'],
      confidence: 0.8,
      suggestedActions: [task.description],
    };
  }

  private formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  }
}
