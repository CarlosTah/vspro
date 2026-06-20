import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { ProductsService } from '../products/products.service';
import { OrdersService } from '../orders/orders.service';
import { CustomersService } from '../customers/customers.service';
import { AiMemoryService } from './ai-memory.service';
import { CustomerMemoryService } from './customer-memory.service';
import { ProactivityService } from '../proactivity/proactivity.service';
import { TenantProvisioningService } from '../tenants/tenant-provisioning.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { BillingService } from '../billing/billing.service';
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
    @Inject(forwardRef(() => TenantProvisioningService))
    private readonly tenantProvisioning: TenantProvisioningService,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly billingService: BillingService,
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

      // 4.1. Inyectar knowledge base del tenant
      const kbContext = await this.knowledgeBase.buildKnowledgeContext(schemaName);

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
        { role: 'system', content: systemPrompt + kbContext + memoryContext },
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
      {
        type: 'function',
        function: {
          name: 'register_business',
          description: 'Registra un nuevo negocio en la plataforma VSPRO. Usa SOLO cuando el prospecto ha confirmado todos sus datos y quiere crear su cuenta. Necesitas: slug, nombre del negocio, email, contraseña y tipo de negocio (industry). SIEMPRE pregunta el giro/tipo de negocio para aplicar el template correcto.',
          parameters: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'URL amigable del negocio (solo letras minúsculas, números y guiones, min 3 chars). Ej: "tortilleria-don-jose", "salon-bella"',
              },
              businessName: {
                type: 'string',
                description: 'Nombre completo del negocio',
              },
              email: {
                type: 'string',
                description: 'Email del dueño del negocio',
              },
              ownerName: {
                type: 'string',
                description: 'Nombre del dueño o contacto principal',
              },
              password: {
                type: 'string',
                description: 'Contraseña elegida por el usuario (mínimo 8 caracteres)',
              },
              industry: {
                type: 'string',
                enum: ['restaurante', 'barberia', 'ropa', 'taller', 'clinica', 'inmobiliaria', 'ecommerce'],
                description: 'Tipo/giro del negocio. restaurante=comida/tacos/café, barberia=salón/estética, ropa=tienda/moda, taller=mecánico/automotriz, clinica=doctor/vet, inmobiliaria=rentas/depas, ecommerce=tienda online',
              },
            },
            required: ['slug', 'businessName', 'email', 'ownerName', 'password', 'industry'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_product',
          description: 'Agrega un producto al catálogo del negocio. Usa cuando el cliente te dice el nombre y precio de un producto o servicio que ofrece.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nombre del producto o servicio' },
              price: { type: 'number', description: 'Precio en MXN' },
              category: { type: 'string', description: 'Categoría del producto (ej: "Cortes", "Tacos", "Vestidos", "Servicios")' },
              description: { type: 'string', description: 'Descripción breve (opcional)' },
              stock: { type: 'number', description: 'Cantidad disponible (default: 50, usa -1 para ilimitado)' },
            },
            required: ['name', 'price'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'set_business_hours',
          description: 'Configura los horarios de atención del negocio. Usa cuando el cliente te dice sus horarios de apertura y cierre.',
          parameters: {
            type: 'object',
            properties: {
              monday: { type: 'string', description: 'Horario lunes (ej: "09:00-20:00" o "cerrado")' },
              tuesday: { type: 'string', description: 'Horario martes' },
              wednesday: { type: 'string', description: 'Horario miércoles' },
              thursday: { type: 'string', description: 'Horario jueves' },
              friday: { type: 'string', description: 'Horario viernes' },
              saturday: { type: 'string', description: 'Horario sábado' },
              sunday: { type: 'string', description: 'Horario domingo' },
              timezone: { type: 'string', description: 'Zona horaria (default: America/Mexico_City)' },
            },
            required: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'set_payment_info',
          description: 'Configura los datos bancarios del negocio para recibir pagos por transferencia. CLABE interbancaria y nombre del banco.',
          parameters: {
            type: 'object',
            properties: {
              bank: { type: 'string', description: 'Nombre del banco (ej: "BBVA", "Banorte", "Santander")' },
              clabe: { type: 'string', description: 'CLABE interbancaria (18 dígitos)' },
              beneficiary: { type: 'string', description: 'Nombre del beneficiario como aparece en el banco' },
            },
            required: ['bank', 'clabe', 'beneficiary'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_delivery_driver',
          description: 'Registra un repartidor/motorepartidor para entregas. Usa cuando el cliente quiere configurar su equipo de delivery.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Nombre del repartidor' },
              phone: { type: 'string', description: 'Teléfono del repartidor con lada (ej: "529841234567")' },
              vehicleType: { type: 'string', description: 'Tipo de vehículo: "moto", "bicicleta", "auto", "a_pie"' },
            },
            required: ['name', 'phone'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'generate_report',
          description: 'Genera un reporte del negocio. Usa cuando el dueño pide información sobre ventas, pedidos, ingresos o desempeño de su negocio.',
          parameters: {
            type: 'object',
            properties: {
              reportType: {
                type: 'string',
                enum: ['daily', 'weekly', 'summary'],
                description: 'Tipo de reporte: daily (hoy), weekly (últimos 7 días), summary (resumen general)',
              },
            },
            required: ['reportType'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'select_plan',
          description: 'Genera un link de pago de Stripe para que el cliente se suscriba a un plan. Usa después del registro cuando el cliente elige su plan, o cuando quiere upgrade. Devuelve una URL de checkout que el cliente abre en su navegador.',
          parameters: {
            type: 'object',
            properties: {
              tenantSlug: {
                type: 'string',
                description: 'Slug del negocio registrado (ej: "tortilleria-don-jose")',
              },
              planSlug: {
                type: 'string',
                enum: ['basic', 'pro', 'enterprise'],
                description: 'Plan elegido: basic ($990/mes), pro ($1,490/mes), enterprise ($2,499/mes)',
              },
            },
            required: ['tenantSlug', 'planSlug'],
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

      case 'register_business': {
        try {
          const tenant = await this.tenantProvisioning.provision({
            slug: args.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            businessName: args.businessName,
            email: args.email,
            ownerName: args.ownerName,
            password: args.password,
          });

          // Auto-apply industry template if provided
          let templateApplied = null;
          if (args.industry) {
            try {
              const templates = await this.prisma.$queryRawUnsafe<any[]>(
                `SELECT slug FROM public.industry_templates WHERE slug = $1`, args.industry,
              );
              if (templates.length > 0) {
                const { IndustryTemplatesService } = await import('../tenants/industry-templates.service');
                const templatesService = new IndustryTemplatesService(this.prisma);
                templateApplied = await templatesService.applyTemplate(args.industry, tenant.schemaName);
              }
            } catch (tplErr: any) {
              this.logger.warn(`Template apply failed: ${tplErr.message}`);
            }
          }

          return JSON.stringify({
            success: true,
            tenantSlug: tenant.slug,
            businessName: tenant.businessName,
            panelUrl: `https://app.vspro.app`,
            trialEndsAt: tenant.trialEndsAt,
            templateApplied: templateApplied ? args.industry : null,
            message: `Negocio registrado exitosamente.${templateApplied ? ` Se pre-cargó configuración de ${args.industry} (${templateApplied.products} productos, ${templateApplied.kbEntries} tips).` : ''} El usuario puede acceder al panel en app.vspro.app con su email y contraseña.`,
          });
        } catch (err: any) {
          if (err.message?.includes('ya está en uso')) {
            return JSON.stringify({ success: false, message: `El slug '${args.slug}' ya está ocupado. Sugiere otro nombre para la URL.` });
          }
          return JSON.stringify({ success: false, message: `Error al registrar: ${err.message}` });
        }
      }

      case 'add_product': {
        try {
          const sku = `PRD-${Date.now().toString(36).toUpperCase()}`;
          const stock = args.stock === -1 ? 9999 : (args.stock ?? 50);

          await this.prisma.$executeRawUnsafe(`
            INSERT INTO "${schemaName}".products (name, price, category, description, sku, is_active)
            VALUES ($1, $2, $3, $4, $5, true)
          `, args.name, args.price, args.category ?? 'General', args.description ?? '', sku);

          // Get the product ID to create inventory
          const products = await this.prisma.$queryRawUnsafe<any[]>(
            `SELECT id FROM "${schemaName}".products WHERE sku = $1`, sku,
          );
          if (products[0]) {
            await this.prisma.$executeRawUnsafe(`
              INSERT INTO "${schemaName}".inventory (product_id, stock_available, stock_minimum)
              VALUES ($1::uuid, $2, 5)
              ON CONFLICT (product_id) DO NOTHING
            `, products[0].id, stock);
          }

          return JSON.stringify({
            success: true,
            product: { name: args.name, price: args.price, category: args.category ?? 'General', sku },
            message: `Producto "${args.name}" agregado al catálogo por $${args.price} MXN.`,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al agregar producto: ${err.message}` });
        }
      }

      case 'set_business_hours': {
        try {
          const schedule: Record<string, any> = {};
          const dayMap: Record<string, string> = {
            monday: 'mon', tuesday: 'tue', wednesday: 'wed',
            thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun',
          };

          for (const [day, abbr] of Object.entries(dayMap)) {
            const val = args[day];
            if (!val || val.toLowerCase() === 'cerrado' || val.toLowerCase() === 'closed') {
              schedule[abbr] = null;
            } else {
              const [open, close] = val.split('-').map((s: string) => s.trim());
              schedule[abbr] = { open, close };
            }
          }

          const hoursJson = JSON.stringify({
            timezone: args.timezone ?? 'America/Mexico_City',
            schedule,
          });

          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schemaName}".ai_config
            SET business_hours = $1::jsonb, updated_at = NOW()
            WHERE id = (SELECT id FROM "${schemaName}".ai_config LIMIT 1)
          `, hoursJson);

          return JSON.stringify({
            success: true,
            schedule,
            message: 'Horarios de atención configurados correctamente.',
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al configurar horarios: ${err.message}` });
        }
      }

      case 'set_payment_info': {
        try {
          const paymentInfo = JSON.stringify({
            bank: args.bank,
            clabe: args.clabe,
            beneficiary: args.beneficiary,
          });

          // Store in ai_config agent_config field
          await this.prisma.$executeRawUnsafe(`
            ALTER TABLE "${schemaName}".ai_config
            ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}'
          `);

          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schemaName}".ai_config
            SET agent_config = jsonb_set(
              COALESCE(agent_config, '{}'::jsonb),
              '{payment_info}',
              $1::jsonb
            ), updated_at = NOW()
            WHERE id = (SELECT id FROM "${schemaName}".ai_config LIMIT 1)
          `, paymentInfo);

          return JSON.stringify({
            success: true,
            bank: args.bank,
            clabe: `****${args.clabe.slice(-4)}`,
            beneficiary: args.beneficiary,
            message: `Datos bancarios configurados: ${args.bank}, CLABE terminación ${args.clabe.slice(-4)}, a nombre de ${args.beneficiary}.`,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al configurar datos bancarios: ${err.message}` });
        }
      }

      case 'add_delivery_driver': {
        try {
          await this.prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "${schemaName}".delivery_drivers (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              name VARCHAR(255) NOT NULL,
              phone VARCHAR(50) NOT NULL,
              vehicle_type VARCHAR(50) NOT NULL DEFAULT 'moto',
              status VARCHAR(50) NOT NULL DEFAULT 'available',
              max_deliveries INTEGER NOT NULL DEFAULT 3,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `);

          const rows = await this.prisma.$queryRawUnsafe<any[]>(`
            INSERT INTO "${schemaName}".delivery_drivers (name, phone, vehicle_type)
            VALUES ($1, $2, $3)
            RETURNING id, name, phone, vehicle_type AS "vehicleType"
          `, args.name, args.phone, args.vehicleType ?? 'moto');

          return JSON.stringify({
            success: true,
            driver: rows[0],
            message: `Repartidor "${args.name}" registrado (${args.vehicleType ?? 'moto'}). Recibirá pedidos por WhatsApp al ${args.phone}.`,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al registrar repartidor: ${err.message}` });
        }
      }

      case 'generate_report': {
        try {
          const now = new Date();
          let dateFilter: string;
          let label: string;

          if (args.reportType === 'daily') {
            dateFilter = `created_at >= CURRENT_DATE`;
            label = 'Hoy';
          } else if (args.reportType === 'weekly') {
            dateFilter = `created_at >= CURRENT_DATE - INTERVAL '7 days'`;
            label = 'Últimos 7 días';
          } else {
            dateFilter = `1=1`;
            label = 'Total histórico';
          }

          const orders = await this.prisma.$queryRawUnsafe<any[]>(`
            SELECT
              COUNT(*) AS total_orders,
              COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
              COUNT(*) FILTER (WHERE status IN ('new', 'payment_pending', 'in_production', 'ready')) AS pending,
              COALESCE(SUM(total), 0) AS revenue,
              COALESCE(SUM(total) FILTER (WHERE status = 'delivered'), 0) AS collected
            FROM "${schemaName}".orders
            WHERE ${dateFilter}
          `);

          const customers = await this.prisma.$queryRawUnsafe<any[]>(`
            SELECT COUNT(*) AS total FROM "${schemaName}".customers WHERE ${dateFilter}
          `);

          const r = orders[0] ?? {};
          const report = {
            period: label,
            orders: {
              total: parseInt(r.total_orders) || 0,
              delivered: parseInt(r.delivered) || 0,
              pending: parseInt(r.pending) || 0,
            },
            revenue: parseFloat(r.revenue) || 0,
            collected: parseFloat(r.collected) || 0,
            newCustomers: parseInt(customers[0]?.total) || 0,
          };

          return JSON.stringify({
            success: true,
            report,
            message: `📊 Reporte ${label}:\n• Pedidos: ${report.orders.total} (${report.orders.delivered} entregados, ${report.orders.pending} pendientes)\n• Revenue: $${report.revenue.toLocaleString()} MXN\n• Cobrado: $${report.collected.toLocaleString()} MXN\n• Nuevos clientes: ${report.newCustomers}`,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al generar reporte: ${err.message}` });
        }
      }

      case 'select_plan': {
        try {
          const tenant = await this.prisma.tenant.findUnique({
            where: { slug: args.tenantSlug },
          });

          if (!tenant) {
            return JSON.stringify({ success: false, message: `No se encontró el negocio '${args.tenantSlug}'. Verifica el nombre.` });
          }

          const result = await this.billingService.createCheckoutSession(
            tenant.id,
            args.planSlug,
            'monthly',
          );

          const planNames: Record<string, string> = { basic: 'Básico ($990/mes)', pro: 'Profesional ($1,490/mes)', enterprise: 'Avanzado ($2,499/mes)' };

          return JSON.stringify({
            success: true,
            checkoutUrl: result.url,
            plan: planNames[args.planSlug] ?? args.planSlug,
            message: `Link de pago generado para el plan ${planNames[args.planSlug]}. El cliente debe abrir el link en su navegador para completar el pago.`,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al generar link de pago: ${err.message}` });
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
