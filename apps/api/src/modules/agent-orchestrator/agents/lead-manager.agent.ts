import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { OrchestratorAgent } from '../agent-registry.service';
import { OrchestratorAgentType, AgentTask, AgentTaskOutput, SessionContext } from '../types';

/**
 * Lead Manager Agent — CRM pipeline management and lead nurturing.
 *
 * Capabilities:
 * - Analyze customer pipeline and conversion funnels
 * - Identify stale leads and recommend follow-up actions
 * - Generate lead scoring based on engagement patterns
 * - Recommend optimal contact timing
 * - Draft personalized outreach sequences
 * - Track lead-to-customer conversion metrics
 */
@Injectable()
export class LeadManagerAgent implements OrchestratorAgent {
  private readonly logger = new Logger(LeadManagerAgent.name);
  private readonly openai: OpenAI;

  readonly name: OrchestratorAgentType = 'lead-manager';
  readonly description = 'Gestión de pipeline CRM: leads, scoring, follow-ups, conversión';
  readonly domains = ['crm', 'leads', 'pipeline', 'conversion', 'follow-up', 'scoring', 'nurturing'];
  readonly riskLevel = 'medium' as const;
  readonly requiresApproval = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') });
  }

  async execute(task: AgentTask, context: SessionContext): Promise<AgentTaskOutput> {
    const schemaName = context.sharedMemory['schemaName'] as string;

    switch (task.type) {
      case 'analysis':
        return this.analyzePipeline(task, schemaName);
      case 'query':
        return this.queryLeadData(task, schemaName);
      case 'action':
        return this.executeLeadAction(task, schemaName);
      case 'report':
        return this.generateReport(task, schemaName);
      default:
        return this.queryLeadData(task, schemaName);
    }
  }

  private async analyzePipeline(task: AgentTask, schemaName: string): Promise<AgentTaskOutput> {
    // Analyze customer conversion pipeline
    const stats = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'new') AS new_leads,
        COUNT(*) FILTER (WHERE status IN ('quoted', 'payment_pending')) AS in_progress,
        COUNT(*) FILTER (WHERE status = 'delivered') AS converted,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS lost,
        COALESCE(AVG(total) FILTER (WHERE status = 'delivered'), 0) AS avg_deal_value,
        COUNT(DISTINCT customer_id) AS unique_customers
      FROM "${schemaName}".orders
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    const data = stats[0] ?? {};
    const conversionRate = data.unique_customers > 0
      ? ((parseInt(data.converted) / parseInt(data.unique_customers)) * 100).toFixed(1)
      : '0';

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Eres un analista de CRM. Analiza estos datos del pipeline y genera insights accionables en español.`,
      }, {
        role: 'user',
        content: `Pipeline últimos 30 días: ${JSON.stringify(data)}. Tasa conversión: ${conversionRate}%. Objetivo: ${task.description}`,
      }],
      temperature: 0.3,
      max_tokens: 500,
    });

    return {
      response: response.choices[0].message.content ?? 'Análisis completado.',
      toolsUsed: ['pipeline_analysis'],
      confidence: 0.85,
      data: { ...data, conversionRate: parseFloat(conversionRate) },
      suggestedActions: ['Seguir leads estancados', 'Revisar objeciones de precio', 'Activar campaña win-back'],
    };
  }

  private async queryLeadData(task: AgentTask, schemaName: string): Promise<AgentTaskOutput> {
    // Get stale leads (customers with pending orders > 3 days)
    const staleLeads = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT c.name, c.phone, o.order_number, o.status, o.total, o.created_at
      FROM "${schemaName}".orders o
      JOIN "${schemaName}".customers c ON c.id = o.customer_id
      WHERE o.status IN ('new', 'quoted', 'payment_pending')
        AND o.created_at < NOW() - INTERVAL '3 days'
      ORDER BY o.total DESC LIMIT 10
    `);

    return {
      response: staleLeads.length > 0
        ? `Encontré ${staleLeads.length} leads estancados. Los de mayor valor: ${staleLeads.slice(0, 3).map(l => `${l.name} ($${parseFloat(l.total).toLocaleString()})`).join(', ')}`
        : 'No hay leads estancados en este momento.',
      toolsUsed: ['stale_leads_query'],
      confidence: 0.9,
      data: { staleLeads, count: staleLeads.length },
    };
  }

  private async executeLeadAction(task: AgentTask, schemaName: string): Promise<AgentTaskOutput> {
    return {
      response: `Acción de lead "${task.description}" registrada. Se requiere revisión humana para acciones masivas.`,
      toolsUsed: ['lead_action'],
      confidence: 0.7,
      suggestedActions: ['Confirmar acción en dashboard'],
    };
  }

  private async generateReport(task: AgentTask, schemaName: string): Promise<AgentTaskOutput> {
    const metrics = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COUNT(*) AS total_orders,
        SUM(total) AS revenue,
        COUNT(DISTINCT customer_id) AS customers,
        AVG(total) AS avg_order
      FROM "${schemaName}".orders
      WHERE status = 'delivered' AND created_at > NOW() - INTERVAL '30 days'
    `);

    const m = metrics[0] ?? {};
    return {
      response: `📊 Reporte de conversión (30d):\n• Pedidos completados: ${m.total_orders}\n• Revenue: $${parseFloat(m.revenue ?? 0).toLocaleString()}\n• Clientes: ${m.customers}\n• Ticket promedio: $${parseFloat(m.avg_order ?? 0).toFixed(0)}`,
      toolsUsed: ['conversion_report'],
      confidence: 0.95,
      data: m,
    };
  }
}
