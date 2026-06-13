import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { ProductsService } from '../products/products.service';
import { OrdersService } from '../orders/orders.service';
import { CustomersService } from '../customers/customers.service';
import { AiMemoryService } from './ai-memory.service';
import { CustomerMemoryService } from './customer-memory.service';
import { ProactivityService } from '../proactivity/proactivity.service';
import { IncomingMessage } from '@vspro/shared';

export interface AiEngineResponse {
  text: string;
  updatedContext?: Record<string, any>;
}

interface ConversationContext {
  id: string;
  context: Record<string, any>;
}

@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
    private readonly ordersService: OrdersService,
    private readonly customersService: CustomersService,
    private readonly aiMemory: AiMemoryService,
    private readonly customerMemory: CustomerMemoryService,
    private readonly proactivityService: ProactivityService,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get('OPENAI_API_KEY'),
    });
  }

  async processMessage(
    tenant: any,
    conversation: ConversationContext,
    message: IncomingMessage,
    schemaName: string,
  ): Promise<AiEngineResponse> {
    // Sin API key válida → respuesta de desarrollo
    const apiKey = this.config.get('OPENAI_API_KEY');
    if (!apiKey || apiKey.startsWith('sk-test') || apiKey === 'sk-...') {
      return this.devModeResponse(message);
    }

    try {
      // 1. Cargar historial reciente de la conversación (últimos 10 mensajes)
      const history = await this.getConversationHistory(conversation.id, schemaName);

      // 2. Cargar configuración de IA del tenant
      const aiConfig = await this.getAiConfig(schemaName, tenant.businessName);

      // 3. Cargar catálogo activo (para el contexto del prompt)
      const products = await this.productsService.findAll(schemaName, true);

      // 4. Construir system prompt dinámico
      const systemPrompt = this.buildSystemPrompt(tenant, aiConfig, products);

      // 4.5. HOOK: Inyectar memoria del cliente antes de la llamada a IA
      const customerId = (conversation.context as any)?.customerId;
      let memoryContext = '';
      if (customerId && message.text) {
        memoryContext = await this.customerMemory.buildMemoryContext(
          customerId,
          message.text,
          schemaName,
        );
      }

      // 5. Construir mensajes para la API (con memoria inyectada)
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt + memoryContext },
        ...history,
      ];

      // Agregar mensaje actual (con imagen si aplica)
      if (message.mediaUrl && message.type === 'image') {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: message.text ?? 'Te envío una imagen' },
            { type: 'image_url', image_url: { url: message.mediaUrl, detail: 'high' } },
          ],
        });
      } else {
        messages.push({ role: 'user', content: message.text ?? '' });
      }

      // 6. Llamar a GPT-4o con function calling
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools: this.getTools(),
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 1000,
      });

      const choice = response.choices[0];

      // 7. Si la IA quiere ejecutar una herramienta
      if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
        return await this.handleToolCalls(
          choice.message.tool_calls,
          messages,
          conversation,
          tenant,
          schemaName,
        );
      }

      // 8. Respuesta de texto directa
      const text = choice.message.content ?? 'Lo siento, no pude procesar tu mensaje.';
      return { text };
    } catch (error) {
      this.logger.error('Error en motor de IA:', error);
      return {
        text: 'Lo siento, tuve un problema técnico. Por favor intenta de nuevo en un momento.',
      };
    }
  }

  // ─── Herramientas disponibles para la IA ─────────────────────

  private getTools(): OpenAI.Chat.ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'check_product_availability',
          description: 'Verifica disponibilidad y precio de un producto por nombre o SKU',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Nombre o SKU del producto' },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_order_status',
          description: 'Consulta el estado de un pedido por número de pedido',
          parameters: {
            type: 'object',
            properties: {
              orderNumber: { type: 'string', description: 'Número de pedido (ej: ORD-2026-00001)' },
            },
            required: ['orderNumber'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_order',
          description: 'Crea un pedido cuando el cliente confirma los productos que quiere',
          parameters: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    productName: { type: 'string' },
                    quantity: { type: 'number' },
                  },
                  required: ['productName', 'quantity'],
                },
              },
              notes: { type: 'string', description: 'Notas especiales del pedido' },
            },
            required: ['items'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'request_payment',
          description: 'Solicita el pago de un pedido y proporciona instrucciones de transferencia',
          parameters: {
            type: 'object',
            properties: {
              orderId: { type: 'string' },
            },
            required: ['orderId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_stock',
          description: 'Verifica el stock exacto de un producto específico. Usa cuando el cliente pregunta cuántas unidades hay disponibles.',
          parameters: {
            type: 'object',
            properties: {
              productName: { type: 'string', description: 'Nombre del producto' },
            },
            required: ['productName'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'apply_discount',
          description: 'Aplica un descuento a un pedido existente. Solo usar si el negocio tiene una promoción activa o el cliente tiene un cupón válido.',
          parameters: {
            type: 'object',
            properties: {
              orderId: { type: 'string', description: 'ID del pedido' },
              discountPercent: { type: 'number', description: 'Porcentaje de descuento (1-50)' },
              reason: { type: 'string', description: 'Razón del descuento (promoción, cupón, etc.)' },
            },
            required: ['orderId', 'discountPercent', 'reason'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_support_ticket',
          description: 'Crea un ticket de soporte cuando el cliente tiene un problema que la IA no puede resolver. Escala a un humano.',
          parameters: {
            type: 'object',
            properties: {
              subject: { type: 'string', description: 'Asunto breve del problema' },
              description: { type: 'string', description: 'Descripción detallada del problema del cliente' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Prioridad del ticket' },
            },
            required: ['subject', 'description', 'priority'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_shipment_tracking',
          description: 'Obtiene información de rastreo de un envío por número de pedido',
          parameters: {
            type: 'object',
            properties: {
              orderNumber: { type: 'string', description: 'Número de pedido' },
            },
            required: ['orderNumber'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_customer_memory',
          description: 'Guarda información aprendida sobre el cliente para futuras conversaciones. Usa "profile" para datos estructurados (preferencias, tallas, direcciones) y "episode" para contexto conversacional.',
          parameters: {
            type: 'object',
            properties: {
              memory_type: {
                type: 'string',
                enum: ['profile', 'episode'],
                description: 'Tipo de memoria: "profile" para datos estructurados, "episode" para contexto conversacional',
              },
              category: {
                type: 'string',
                description: 'Para profile: preferences|sizes|addresses|purchase_history_summary|important_dates|custom_facts. Para episode: conversation_summary|preference_detected|complaint|product_interest|general_context.',
              },
              content: {
                type: 'string',
                description: 'Texto descriptivo del recuerdo (requerido para episodes)',
              },
              data: {
                type: 'object',
                description: 'Datos estructurados para profile updates (ej: {"color": "azul", "talla": "M"})',
              },
            },
            required: ['memory_type', 'category'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'schedule_follow_up',
          description: 'Programa un mensaje de seguimiento proactivo para esta conversación. Usa cuando el cliente necesita tiempo para decidir, cuando prometiste información futura, o para dar seguimiento a un pedido.',
          parameters: {
            type: 'object',
            properties: {
              delay_hours: {
                type: 'number',
                description: 'Horas en el futuro para el follow-up (mínimo 1, máximo 168 = 7 días)',
              },
              reason: {
                type: 'string',
                description: 'Razón del seguimiento (ej: "cliente pidió tiempo para decidir", "confirmar recepción de pedido")',
              },
            },
            required: ['delay_hours', 'reason'],
          },
        },
      },
    ];
  }

  // ─── Ejecución de herramientas ────────────────────────────────

  private async handleToolCalls(
    toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[],
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    conversation: ConversationContext,
    tenant: any,
    schemaName: string,
  ): Promise<AiEngineResponse> {
    // Agregar el mensaje del asistente con las tool calls
    messages.push({
      role: 'assistant',
      tool_calls: toolCalls,
      content: null,
    });

    // Ejecutar cada herramienta
    for (const toolCall of toolCalls) {
      const args = JSON.parse(toolCall.function.arguments);
      let result: string;

      try {
        result = await this.executeTool(
          toolCall.function.name,
          args,
          conversation,
          tenant,
          schemaName,
        );
      } catch (error: any) {
        result = `Error: ${error.message}`;
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    // Segunda llamada a GPT con los resultados de las herramientas
    const finalResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.3,
      max_tokens: 800,
    });

    const text = finalResponse.choices[0]?.message?.content
      ?? 'Procesé tu solicitud correctamente.';

    return { text };
  }

  private async executeTool(
    name: string,
    args: any,
    conversation: ConversationContext,
    tenant: any,
    schemaName: string,
  ): Promise<string> {
    switch (name) {
      case 'check_product_availability': {
        const products = await this.productsService.search(args.query, schemaName);
        if (products.length === 0) {
          return JSON.stringify({ found: false, message: 'Producto no encontrado' });
        }
        return JSON.stringify({
          found: true,
          products: products.map((p: any) => ({
            name: p.name,
            price: p.price,
            available: p.stockAvailable > 0,
            stock: p.stockAvailable,
          })),
        });
      }

      case 'get_order_status': {
        try {
          const order = await this.ordersService.findByOrderNumber(
            args.orderNumber,
            schemaName,
          );
          return JSON.stringify({
            orderNumber: order.orderNumber,
            status: order.status,
            total: order.total,
          });
        } catch {
          return JSON.stringify({ found: false, message: 'Pedido no encontrado' });
        }
      }

      case 'create_order': {
        // Resolver productos por nombre
        const resolvedItems: { productId: string; quantity: number }[] = [];
        for (const item of args.items) {
          const found = await this.productsService.search(item.productName, schemaName);
          if (found.length > 0) {
            resolvedItems.push({ productId: found[0].id, quantity: item.quantity });
          }
        }

        if (resolvedItems.length === 0) {
          return JSON.stringify({ success: false, message: 'No se encontraron los productos' });
        }

        // Obtener customerId del contexto de la conversación
        const ctx = conversation.context as any;
        if (!ctx?.customerId) {
          return JSON.stringify({ success: false, message: 'No se pudo identificar al cliente' });
        }

        const order = await this.ordersService.create(
          {
            customerId: ctx.customerId,
            channelType: 'whatsapp',
            items: resolvedItems,
            notes: args.notes,
          },
          schemaName,
        );

        return JSON.stringify({
          success: true,
          orderNumber: order.orderNumber,
          total: order.total,
          orderId: order.id,
        });
      }

      case 'request_payment': {
        try {
          await this.ordersService.transition(args.orderId, 'payment_pending', schemaName);
          const order = await this.ordersService.findById(args.orderId, schemaName);
          return JSON.stringify({
            success: true,
            orderNumber: order.orderNumber,
            total: order.total,
            instructions: 'Solicitar transferencia bancaria y comprobante',
          });
        } catch (error: any) {
          return JSON.stringify({ success: false, message: error.message });
        }
      }

      case 'check_stock': {
        const products = await this.productsService.search(args.productName, schemaName);
        if (products.length === 0) {
          return JSON.stringify({ found: false, message: 'Producto no encontrado' });
        }
        const p = products[0] as any;
        return JSON.stringify({
          found: true,
          product: p.name,
          stockAvailable: p.stockAvailable ?? 0,
          stockReserved: p.stockReserved ?? 0,
          canOrder: (p.stockAvailable ?? 0) > 0,
        });
      }

      case 'apply_discount': {
        // Validación: máximo 50% de descuento
        const percent = args.discountPercent;
        if (percent < 1 || percent > 50) {
          return JSON.stringify({ success: false, message: 'Descuento debe ser entre 1% y 50%' });
        }

        try {
          const order = await this.ordersService.findById(args.orderId, schemaName);
          const currentTotal = parseFloat(order.total);
          const discount = currentTotal * (percent / 100);
          const newTotal = currentTotal - discount;

          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schemaName}".orders
            SET total = $1, notes = COALESCE(notes, '') || $2, updated_at = NOW()
            WHERE id = $3::uuid
          `, newTotal, `\n[Descuento ${percent}%: -$${discount.toFixed(2)} — ${args.reason}]`, args.orderId);

          return JSON.stringify({
            success: true,
            originalTotal: currentTotal,
            discount: discount.toFixed(2),
            newTotal: newTotal.toFixed(2),
            reason: args.reason,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: err.message });
        }
      }

      case 'create_support_ticket': {
        // Guardar como mensaje especial en la conversación
        const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;

        await this.prisma.$executeRawUnsafe(`
          INSERT INTO "${schemaName}".messages
            (conversation_id, direction, type, content, ai_processed)
          VALUES ($1::uuid, 'outbound', 'text', $2, true)
        `,
          conversation.id,
          `[TICKET ${ticketId}] Prioridad: ${args.priority}\nAsunto: ${args.subject}\n${args.description}`,
        );

        return JSON.stringify({
          success: true,
          ticketId,
          subject: args.subject,
          priority: args.priority,
          message: 'Ticket creado. Un agente humano se pondrá en contacto pronto.',
        });
      }

      case 'get_shipment_tracking': {
        try {
          const order = await this.ordersService.findByOrderNumber(args.orderNumber, schemaName);
          const shipments = await this.prisma.$queryRawUnsafe<any[]>(`
            SELECT carrier, tracking_number AS "trackingNumber",
                   tracking_url AS "trackingUrl", status
            FROM "${schemaName}".shipments
            WHERE order_id = $1::uuid
            ORDER BY created_at DESC LIMIT 1
          `, order.id);

          if (!shipments[0]) {
            return JSON.stringify({ found: false, message: 'Este pedido aún no tiene envío registrado' });
          }

          return JSON.stringify({
            found: true,
            orderNumber: args.orderNumber,
            carrier: shipments[0].carrier,
            trackingNumber: shipments[0].trackingNumber,
            trackingUrl: shipments[0].trackingUrl,
            status: shipments[0].status,
          });
        } catch {
          return JSON.stringify({ found: false, message: 'Pedido no encontrado' });
        }
      }

      case 'update_customer_memory': {
        const customerId = (conversation.context as any)?.customerId;
        return this.customerMemory.handleToolCall(customerId, args, schemaName);
      }

      case 'schedule_follow_up': {
        try {
          const result = await this.proactivityService.scheduleFollowUp(
            conversation.id,
            args.delay_hours,
            args.reason,
            schemaName,
          );
          return JSON.stringify({
            success: true,
            message: `Follow-up programado para ${result.scheduledAt}`,
            scheduledAt: result.scheduledAt,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, error: err.message });
        }
      }

      default:
        return JSON.stringify({ error: `Herramienta desconocida: ${name}` });
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async getConversationHistory(
    conversationId: string,
    schemaName: string,
  ): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
    const messages = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT direction, content
      FROM "${schemaName}".messages
      WHERE conversation_id = $1::uuid
        AND type = 'text'
        AND content IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 10
    `, conversationId);

    // Invertir para orden cronológico y mapear a formato OpenAI
    return messages.reverse().map((m) => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.content,
    }));
  }

  private async getAiConfig(schemaName: string, businessName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT assistant_name AS "assistantName", tone, welcome_message AS "welcomeMessage",
             away_message AS "awayMessage", language, business_hours AS "businessHours",
             custom_instructions AS "customInstructions"
      FROM "${schemaName}".ai_config
      LIMIT 1
    `);

    return rows[0] ?? {
      assistantName: 'Asistente',
      tone: 'friendly',
      welcomeMessage: `¡Hola! Soy el asistente de ${businessName}. ¿En qué te ayudo?`,
      language: 'es',
    };
  }

  private buildSystemPrompt(
    tenant: any,
    aiConfig: any,
    products: any[],
  ): string {
    const productList = products
      .slice(0, 20) // máximo 20 productos en el prompt
      .map((p: any) => `- ${p.name}: $${p.price}${p.stockAvailable > 0 ? '' : ' (sin stock)'}`)
      .join('\n');

    return `Eres ${aiConfig.assistantName}, el asistente virtual de ${tenant.businessName}.
Tu tono es ${aiConfig.tone ?? 'amigable'}.
Responde SIEMPRE en español.

INSTRUCCIONES:
- Ayuda a los clientes a realizar pedidos de forma clara y amigable
- Cuando el cliente quiera pedir algo, usa la herramienta create_order
- Cuando pregunten por disponibilidad, usa check_product_availability
- Cuando pregunten por su pedido, usa get_order_status
- Si no puedes ayudar, ofrece contactar a un humano
- Sé conciso — los mensajes de WhatsApp deben ser cortos

CATÁLOGO DISPONIBLE:
${productList || 'No hay productos disponibles en este momento.'}

${aiConfig.customInstructions ? `INSTRUCCIONES ADICIONALES:\n${aiConfig.customInstructions}` : ''}`.trim();
  }

  /** Respuesta de desarrollo cuando no hay API key de OpenAI */
  private devModeResponse(message: IncomingMessage): AiEngineResponse {
    const text = message.text?.toLowerCase() ?? '';

    if (text.includes('hola') || text.includes('buenos')) {
      return { text: '¡Hola! Soy el asistente virtual. ¿En qué te puedo ayudar? (modo desarrollo)' };
    }
    if (text.includes('precio') || text.includes('producto')) {
      return { text: 'Tenemos varios productos disponibles. ¿Cuál te interesa? (modo desarrollo)' };
    }
    if (text.includes('pedido') || text.includes('orden')) {
      return { text: 'Con gusto te ayudo con tu pedido. ¿Qué deseas ordenar? (modo desarrollo)' };
    }

    return {
      text: `Recibí tu mensaje: "${message.text}". Estoy en modo desarrollo — configura OPENAI_API_KEY para respuestas reales.`,
    };
  }
}
