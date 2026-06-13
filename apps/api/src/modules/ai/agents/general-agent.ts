import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { CustomerMemoryService } from '../customer-memory.service';
import { BaseAgent } from './base-agent';
import { AgentContext, AgentSettings } from './types';

/**
 * General-purpose fallback agent.
 * Wraps the current monolithic AiEngineService behavior for backward compatibility.
 * Used when: router confidence < 0.7, agent disabled, or no agent_config defined.
 */
@Injectable()
export class GeneralAgent extends BaseAgent {
  readonly name = 'general';
  readonly description = 'Agente general (fallback — comportamiento actual)';

  constructor(prisma: PrismaService, config: ConfigService, customerMemory: CustomerMemoryService) {
    super(prisma, config, customerMemory);
  }

  getSystemPrompt(tenant: any, _settings: AgentSettings): string {
    return `Eres el asistente virtual de ${tenant.businessName}.
Responde SIEMPRE en español.

INSTRUCCIONES:
- Ayuda a los clientes a realizar pedidos de forma clara y amigable
- Cuando el cliente quiera pedir algo, usa la herramienta create_order
- Cuando pregunten por disponibilidad, usa check_product_availability
- Cuando pregunten por su pedido, usa get_order_status
- Si no puedes ayudar, ofrece contactar a un humano
- Sé conciso — los mensajes de WhatsApp deben ser cortos`;
  }

  getTools(): OpenAI.Chat.ChatCompletionTool[] {
    // Full tool set — same as current monolithic AiEngineService
    return [
      {
        type: 'function',
        function: {
          name: 'check_product_availability',
          description: 'Verifica disponibilidad y precio de un producto',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_order_status',
          description: 'Consulta el estado de un pedido',
          parameters: {
            type: 'object',
            properties: { orderNumber: { type: 'string' } },
            required: ['orderNumber'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_order',
          description: 'Crea un pedido',
          parameters: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'object', properties: { productName: { type: 'string' }, quantity: { type: 'number' } }, required: ['productName', 'quantity'] } },
              notes: { type: 'string' },
            },
            required: ['items'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_customer_memory',
          description: 'Guarda información del cliente para futuras conversaciones',
          parameters: {
            type: 'object',
            properties: {
              memory_type: { type: 'string', enum: ['profile', 'episode'] },
              category: { type: 'string' },
              content: { type: 'string' },
              data: { type: 'object' },
            },
            required: ['memory_type', 'category'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'schedule_follow_up',
          description: 'Programa un seguimiento proactivo',
          parameters: {
            type: 'object',
            properties: {
              delay_hours: { type: 'number' },
              reason: { type: 'string' },
            },
            required: ['delay_hours', 'reason'],
          },
        },
      },
    ];
  }

  async executeTool(name: string, args: any, context: AgentContext): Promise<string> {
    const { schemaName } = context;

    switch (name) {
      case 'check_product_availability': {
        const products = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT p.name, p.price, i.stock_available
          FROM "${schemaName}".products p
          LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
          WHERE p.is_active = true AND (p.name ILIKE $1 OR p.sku ILIKE $1)
          LIMIT 5
        `, `%${args.query}%`);
        if (products.length === 0) return JSON.stringify({ found: false });
        return JSON.stringify({ found: true, products: products.map(p => ({ name: p.name, price: p.price, stock: p.stock_available ?? 0 })) });
      }

      case 'get_order_status': {
        const orders = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT order_number, status, total FROM "${schemaName}".orders WHERE order_number = $1
        `, args.orderNumber);
        if (!orders[0]) return JSON.stringify({ found: false });
        return JSON.stringify({ found: true, ...orders[0] });
      }

      case 'create_order':
        return JSON.stringify({ success: true, message: 'Pedido creado (delegado)' });

      case 'update_customer_memory':
        return this.customerMemory.handleToolCall(context.customerId, args, schemaName);

      case 'schedule_follow_up': {
        const scheduledAt = new Date(Date.now() + args.delay_hours * 3600000);
        await this.prisma.$executeRawUnsafe(`
          UPDATE "${schemaName}".conversations SET next_follow_up_at = $1 WHERE id = $2::uuid
        `, scheduledAt.toISOString(), context.conversationId);
        return JSON.stringify({ success: true, scheduledAt: scheduledAt.toISOString() });
      }

      default:
        return JSON.stringify({ error: `Tool '${name}' not recognized` });
    }
  }
}
