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
import { OwnerNotificationService } from '../notifications/owner-notification.service';
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
    private readonly ownerNotification: OwnerNotificationService,
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
      const isOwner = (conversation.context as any)?.isOwner === true;
      const systemPrompt = isOwner
        ? this.buildOwnerSystemPrompt(tenant, products)
        : this.buildSystemPrompt(tenant, aiConfig, products);

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
      // Inject active order context if exists
      let orderContext = '';
      const convCtx = conversation.context as any;
      if (convCtx?.lastOrderId) {
        orderContext = `\n\nPEDIDO ACTIVO EN ESTA CONVERSACIÓN:\n- Order ID: ${convCtx.lastOrderId}\n- Número: ${convCtx.lastOrderNumber ?? 'N/A'}\nUsa este orderId para set_delivery_address y request_payment sin pedir al cliente.\n`;
      }

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt + kbContext + memoryContext + orderContext },
        ...history,
      ];

      // Agregar mensaje actual (con imagen si aplica)
      if (message.mediaUrl && message.type === 'image') {
        // Download image from Meta and convert to base64 for GPT-4o Vision
        let imageUrl = message.mediaUrl;
        try {
          const axios = (await import('axios')).default;
          // Get the channel access token
          const channelRows = await this.prisma.$queryRawUnsafe<any[]>(
            `SELECT access_token FROM "${schemaName}".channels WHERE type = 'whatsapp' AND is_active = true LIMIT 1`
          );
          const accessToken = channelRows[0]?.access_token;
          if (accessToken) {
            // Get media download URL from Meta
            const mediaInfo = await axios.get(message.mediaUrl, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const downloadUrl = mediaInfo.data?.url;
            if (downloadUrl) {
              // Download actual image
              const imgResponse = await axios.get(downloadUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
                responseType: 'arraybuffer',
              });
              const base64 = Buffer.from(imgResponse.data).toString('base64');
              const mimeType = imgResponse.headers['content-type'] || 'image/jpeg';
              imageUrl = `data:${mimeType};base64,${base64}`;
            }
          }
        } catch (err: any) {
          this.logger.warn(`Could not download image from Meta: ${err.message}`);
          // Fallback: try using the URL directly (might work for non-Meta images)
        }

        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: message.text ?? 'Te envío una imagen' },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
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
      {
        type: 'function',
        function: {
          name: 'set_delivery_address',
          description: 'Establece la dirección de entrega para un pedido existente. Usa cuando el cliente proporciona su dirección o ubicación para el envío. Si recibiste una ubicación de WhatsApp (coordenadas), incluye lat y lng.',
          parameters: {
            type: 'object',
            properties: {
              orderId: {
                type: 'string',
                description: 'ID del pedido (UUID)',
              },
              street: {
                type: 'string',
                description: 'Calle y número',
              },
              colony: {
                type: 'string',
                description: 'Colonia o fraccionamiento',
              },
              city: {
                type: 'string',
                description: 'Ciudad',
              },
              reference: {
                type: 'string',
                description: 'Referencias adicionales (entre calles, color de casa, etc.)',
              },
              lat: {
                type: 'number',
                description: 'Latitud (si el cliente envió ubicación de WhatsApp)',
              },
              lng: {
                type: 'number',
                description: 'Longitud (si el cliente envió ubicación de WhatsApp)',
              },
            },
            required: ['orderId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'escalate_complaint',
          description: 'Escala una queja o problema grave al dueño del negocio. Usa cuando el cliente está frustrado, molesto o tiene un problema que no puedes resolver (producto defectuoso, mal servicio, pedido incorrecto, etc.). El dueño recibirá una notificación inmediata por WhatsApp con el contexto.',
          parameters: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                description: 'Resumen breve de la queja o problema del cliente',
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Prioridad: high=cliente muy molesto/urgente, medium=problema claro pero no urgente, low=sugerencia/comentario',
              },
              orderNumber: {
                type: 'string',
                description: 'Número de pedido relacionado (si aplica)',
              },
            },
            required: ['reason', 'priority'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'cancel_order',
          description: 'Cancela un pedido existente. Solo se puede cancelar si el pedido NO está en producción o en entrega. Siempre pide el motivo al cliente antes de cancelar.',
          parameters: {
            type: 'object',
            properties: {
              orderId: {
                type: 'string',
                description: 'ID del pedido a cancelar',
              },
              reason: {
                type: 'string',
                description: 'Motivo de la cancelación proporcionado por el cliente',
              },
            },
            required: ['orderId', 'reason'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_availability',
          description: 'Verifica disponibilidad de fechas para una reserva/hospedaje. Usa cuando el cliente pregunta si hay disponibilidad en ciertas fechas.',
          parameters: {
            type: 'object',
            properties: {
              checkIn: { type: 'string', description: 'Fecha de entrada (YYYY-MM-DD)' },
              checkOut: { type: 'string', description: 'Fecha de salida (YYYY-MM-DD)' },
            },
            required: ['checkIn', 'checkOut'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_reservation',
          description: 'Crea una reserva para un huésped. Usa cuando el cliente confirma que quiere reservar en las fechas disponibles. Pide nombre, teléfono y fechas antes de usar.',
          parameters: {
            type: 'object',
            properties: {
              guestName: { type: 'string', description: 'Nombre del huésped' },
              guestPhone: { type: 'string', description: 'Teléfono del huésped' },
              checkIn: { type: 'string', description: 'Fecha de entrada (YYYY-MM-DD)' },
              checkOut: { type: 'string', description: 'Fecha de salida (YYYY-MM-DD)' },
              guests: { type: 'number', description: 'Número de huéspedes' },
              notes: { type: 'string', description: 'Notas especiales (hora de llegada, etc.)' },
            },
            required: ['guestName', 'checkIn', 'checkOut'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_property_info',
          description: 'Obtiene información de la propiedad/hospedaje: características, amenidades, reglas, precios. Usa cuando el cliente pregunta detalles sobre el lugar.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Qué quiere saber: "precio", "amenidades", "reglas", "ubicación", "capacidad"' },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'send_media_to_customer',
          description: 'Envía una imagen o material gráfico al cliente (menú, promociones, catálogo, fotos de productos). Usa cuando el cliente pregunte por el menú, las promociones, fotos del producto, o cualquier material visual.',
          parameters: {
            type: 'object',
            properties: {
              mediaType: {
                type: 'string',
                enum: ['menu', 'promo', 'catalog', 'product', 'general'],
                description: 'Tipo de material: menu=carta/menú, promo=promociones, catalog=catálogo completo, product=foto de producto específico, general=otro material',
              },
              productName: {
                type: 'string',
                description: 'Nombre del producto específico (solo si mediaType es "product")',
              },
            },
            required: ['mediaType'],
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
    // Allow second round of tool calls (e.g., memory saves after order creation)
    const finalResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: this.getTools(),
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 800,
    });

    const finalChoice = finalResponse.choices[0];

    // If GPT wants MORE tool calls (e.g., save memory), execute them
    if (finalChoice.finish_reason === 'tool_calls' && finalChoice.message.tool_calls) {
      messages.push({ role: 'assistant', tool_calls: finalChoice.message.tool_calls, content: null });
      for (const toolCall of finalChoice.message.tool_calls) {
        const args2 = JSON.parse(toolCall.function.arguments);
        let result2: string;
        try {
          result2 = await this.executeTool(toolCall.function.name, args2, conversation, tenant, schemaName);
        } catch (e: any) {
          result2 = `Error: ${e.message}`;
        }
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result2 });
      }
      // Third call — text only, no more tools
      const thirdResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.3,
        max_tokens: 800,
      });
      return { text: thirdResponse.choices[0]?.message?.content ?? 'Procesé tu solicitud correctamente.' };
    }

    const text = finalChoice.message.content ?? 'Procesé tu solicitud correctamente.';
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

        // IMPORTANT: Persist orderId in conversation context for subsequent tool calls
        const updatedContext = { ...(conversation.context as any), lastOrderId: order.id, lastOrderNumber: order.orderNumber };
        await this.prisma.$executeRawUnsafe(`
          UPDATE "${schemaName}".conversations SET context = $1::jsonb WHERE id = $2::uuid
        `, JSON.stringify(updatedContext), conversation.id);
        // Update local reference too
        (conversation.context as any).lastOrderId = order.id;
        (conversation.context as any).lastOrderNumber = order.orderNumber;

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
        try {
          const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;
          const customerId = (conversation.context as any)?.customerId;
          let customerName = 'Cliente';
          let customerPhone = '';

          if (customerId) {
            const customers = await this.prisma.$queryRawUnsafe<any[]>(
              `SELECT name, channel_id FROM "${schemaName}".customers WHERE id = $1::uuid`, customerId,
            );
            if (customers[0]) {
              customerName = customers[0].name || 'Cliente';
              customerPhone = customers[0].channel_id || '';
            }
          }

          // Ensure support_tickets table exists
          await this.prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "${schemaName}".support_tickets (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              ticket_number VARCHAR(50) NOT NULL,
              conversation_id UUID,
              customer_id UUID,
              subject VARCHAR(255) NOT NULL,
              description TEXT,
              priority VARCHAR(20) NOT NULL DEFAULT 'medium',
              status VARCHAR(20) NOT NULL DEFAULT 'open',
              assigned_to VARCHAR(255),
              resolution_note TEXT,
              resolved_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `);

          // Insert ticket
          await this.prisma.$executeRawUnsafe(`
            INSERT INTO "${schemaName}".support_tickets
              (ticket_number, conversation_id, customer_id, subject, description, priority)
            VALUES ($1, $2::uuid, $3, $4, $5, $6)
          `, ticketNumber, conversation.id, customerId ?? null, args.subject, args.description, args.priority);

          // Notify owner via WhatsApp
          await this.ownerNotification.notifyOwner({
            schemaName,
            type: 'ticket',
            title: `Ticket #${ticketNumber}: ${args.subject}`,
            body: args.description,
            customerName,
            customerPhone,
            priority: args.priority,
          });

          return JSON.stringify({
            success: true,
            ticketNumber,
            subject: args.subject,
            priority: args.priority,
            message: `Ticket #${ticketNumber} creado. El dueño del negocio ha sido notificado y dará seguimiento a tu caso.`,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al crear ticket: ${err.message}` });
        }
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
          // Get sender's phone from conversation context to link their WhatsApp
          const senderPhone = (conversation.context as any)?.senderPhone ?? null;

          const tenant = await this.tenantProvisioning.provision({
            slug: args.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            businessName: args.businessName,
            email: args.email,
            ownerName: args.ownerName,
            password: args.password,
            phone: senderPhone,
          } as any);

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

      case 'set_delivery_address': {
        try {
          // Use orderId from args, or fallback to lastOrderId from conversation context
          const orderId = args.orderId || (conversation.context as any)?.lastOrderId;
          if (!orderId) {
            return JSON.stringify({ success: false, message: 'No hay pedido activo. Primero crea un pedido.' });
          }

          const address: Record<string, any> = {};
          if (args.street) address.street = args.street;
          if (args.colony) address.colony = args.colony;
          if (args.city) address.city = args.city;
          if (args.reference) address.reference = args.reference;
          if (args.lat) address.lat = args.lat;
          if (args.lng) address.lng = args.lng;
          if (args.lat && args.lng) {
            address.mapsUrl = `https://maps.google.com/?q=${args.lat},${args.lng}`;
          }

          await this.prisma.$executeRawUnsafe(`
            ALTER TABLE "${schemaName}".orders ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(20) DEFAULT 'pickup'
          `);
          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schemaName}".orders
            SET shipping_address = $1::jsonb, delivery_type = 'delivery', updated_at = NOW()
            WHERE id = $2::uuid
          `, JSON.stringify(address), orderId);

          const readable = [
            args.street,
            args.colony,
            args.city,
          ].filter(Boolean).join(', ') || 'Ubicación guardada';

          return JSON.stringify({
            success: true,
            address,
            message: `Dirección de entrega guardada: ${readable}${address.mapsUrl ? ` 📍 ${address.mapsUrl}` : ''}`,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al guardar dirección: ${err.message}` });
        }
      }

      case 'escalate_complaint': {
        try {
          const customerId = (conversation.context as any)?.customerId;
          let customerName = 'Cliente';
          let customerPhone = '';

          if (customerId) {
            const customers = await this.prisma.$queryRawUnsafe<any[]>(
              `SELECT name, channel_id FROM "${schemaName}".customers WHERE id = $1::uuid`, customerId,
            );
            if (customers[0]) {
              customerName = customers[0].name || 'Cliente';
              customerPhone = customers[0].channel_id || '';
            }
          }

          // Create escalation record
          await this.prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "${schemaName}".escalations (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              conversation_id UUID,
              customer_id UUID,
              reason TEXT NOT NULL,
              priority VARCHAR(20) NOT NULL DEFAULT 'medium',
              order_number VARCHAR(50),
              status VARCHAR(20) NOT NULL DEFAULT 'open',
              resolved_at TIMESTAMPTZ,
              resolved_by VARCHAR(255),
              resolution_note TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `);

          await this.prisma.$executeRawUnsafe(`
            INSERT INTO "${schemaName}".escalations (conversation_id, customer_id, reason, priority, order_number)
            VALUES ($1::uuid, $2, $3, $4, $5)
          `, conversation.id, customerId ?? null, args.reason, args.priority, args.orderNumber ?? null);

          // Notify owner via WhatsApp
          await this.ownerNotification.notifyOwner({
            schemaName,
            type: 'complaint',
            title: 'Queja de cliente',
            body: args.reason,
            customerName,
            customerPhone,
            orderNumber: args.orderNumber,
            priority: args.priority,
          });

          return JSON.stringify({
            success: true,
            message: `Queja escalada al equipo. El dueño ha sido notificado y dará seguimiento pronto.`,
            priority: args.priority,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al escalar: ${err.message}` });
        }
      }

      case 'cancel_order': {
        try {
          // Validate order exists and check status
          const order = await this.ordersService.findById(args.orderId, schemaName);
          const nonCancellable = ['in_production', 'ready', 'shipped', 'delivered'];

          if (nonCancellable.includes(order.status)) {
            return JSON.stringify({
              success: false,
              message: `No se puede cancelar el pedido #${order.orderNumber} porque está en estado "${order.status}". Solo se pueden cancelar pedidos que aún no entran a producción.`,
            });
          }

          // Cancel the order
          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schemaName}".orders
            SET status = 'cancelled', notes = COALESCE(notes, '') || $1, updated_at = NOW()
            WHERE id = $2::uuid
          `, `\n[CANCELADO: ${args.reason}]`, args.orderId);

          // Get customer info for notification
          const customerId = (conversation.context as any)?.customerId;
          let customerName = 'Cliente';
          if (customerId) {
            const customers = await this.prisma.$queryRawUnsafe<any[]>(
              `SELECT name FROM "${schemaName}".customers WHERE id = $1::uuid`, customerId,
            );
            if (customers[0]) customerName = customers[0].name || 'Cliente';
          }

          // Notify owner
          await this.ownerNotification.notifyOwner({
            schemaName,
            type: 'cancellation',
            title: 'Pedido cancelado',
            body: `Motivo: ${args.reason}`,
            customerName,
            orderNumber: order.orderNumber,
            priority: 'medium',
          });

          return JSON.stringify({
            success: true,
            orderNumber: order.orderNumber,
            message: `Pedido #${order.orderNumber} cancelado. Motivo: ${args.reason}`,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al cancelar: ${err.message}` });
        }
      }

      case 'check_availability': {
        try {
          const { ReservationsService } = await import('../reservations/reservations.service');
          const reservationsService = new ReservationsService(this.prisma);

          // Check if tenant has multiple properties
          let propertiesInfo = '';
          try {
            const props = await this.prisma.$queryRawUnsafe<any[]>(`
              SELECT id, name, capacity, price_per_night AS "pricePerNight"
              FROM "${schemaName}".properties WHERE is_active = true ORDER BY name
            `);
            if (props.length > 1) {
              propertiesInfo = `\n\nPropiedades disponibles:\n${props.map(p => `• ${p.name} (${p.capacity} huéspedes, $${parseFloat(p.pricePerNight)}/noche)`).join('\n')}`;
            }
          } catch {}

          const result = await reservationsService.checkAvailability(args.checkIn, args.checkOut, schemaName);

          if (result.available) {
            const price = await reservationsService.calculatePrice(args.checkIn, args.checkOut, schemaName);
            const nights = Math.ceil((new Date(args.checkOut).getTime() - new Date(args.checkIn).getTime()) / 86400000);
            return JSON.stringify({
              available: true,
              checkIn: args.checkIn,
              checkOut: args.checkOut,
              nights,
              totalPrice: price,
              pricePerNight: nights > 0 ? Math.round(price / nights) : 0,
              message: `¡Sí hay disponibilidad! Del ${args.checkIn} al ${args.checkOut} (${nights} noches) por $${price.toLocaleString('es-MX')} MXN${nights > 0 ? ` ($${Math.round(price / nights)}/noche)` : ''}.${propertiesInfo}`,
            });
          } else {
            return JSON.stringify({
              available: false,
              conflicts: result.conflicts.length,
              message: `Lo siento, esas fechas no están disponibles. Ya hay ${result.conflicts.length} reserva(s) en ese período. ¿Te gustaría consultar otras fechas?${propertiesInfo}`,
            });
          }
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al verificar: ${err.message}` });
        }
      }

      case 'create_reservation': {
        try {
          const { ReservationsService } = await import('../reservations/reservations.service');
          const reservationsService = new ReservationsService(this.prisma);
          const reservation = await reservationsService.create({
            guestName: args.guestName,
            guestPhone: args.guestPhone,
            checkIn: args.checkIn,
            checkOut: args.checkOut,
            guests: args.guests ?? 1,
            notes: args.notes,
          }, schemaName);

          return JSON.stringify({
            success: true,
            reservationId: reservation.id,
            ...reservation,
            message: `Reserva confirmada para ${args.guestName}. Check-in: ${args.checkIn}, Check-out: ${args.checkOut} (${reservation.nights} noches). Total: $${parseFloat(reservation.totalPrice).toLocaleString('es-MX')} MXN. Para confirmar, se requiere un anticipo.`,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al reservar: ${err.message}` });
        }
      }

      case 'get_property_info': {
        try {
          // Try to get from properties table first (inmobiliaria)
          let props: any[] = [];
          try {
            props = await this.prisma.$queryRawUnsafe<any[]>(`
              SELECT id, name, description, address, capacity, bedrooms, bathrooms,
                     amenities, rules, images, price_per_night AS "pricePerNight",
                     price_per_week AS "pricePerWeek", price_per_month AS "pricePerMonth",
                     min_nights AS "minNights", lat, lng
              FROM "${schemaName}".properties WHERE is_active = true
            `);
          } catch {}

          if (props.length > 0) {
            // Has rental properties
            if (props.length === 1) {
              const p = props[0];
              const amenitiesList = (p.amenities ?? []).join(', ');
              const rulesList = (p.rules ?? []).map((r: string) => `• ${r}`).join('\n');
              const mapsLink = p.lat && p.lng ? `https://maps.google.com/?q=${p.lat},${p.lng}` : '';

              return JSON.stringify({
                success: true,
                property: p,
                message: `🏠 *${p.name}*\n\n${p.description ?? ''}\n\n` +
                  `📍 ${p.address ?? 'Ubicación disponible al reservar'}${mapsLink ? ` (${mapsLink})` : ''}\n` +
                  `👥 Hasta ${p.capacity} huéspedes | 🛏️ ${p.bedrooms} hab | 🚿 ${p.bathrooms} baños\n` +
                  `💰 Desde $${parseFloat(p.pricePerNight)}/noche` +
                  (p.pricePerWeek ? ` | $${parseFloat(p.pricePerWeek)}/semana` : '') +
                  (p.pricePerMonth ? ` | $${parseFloat(p.pricePerMonth)}/mes` : '') +
                  `\n📅 Mínimo ${p.minNights} noche(s)` +
                  (amenitiesList ? `\n\n✨ Amenidades: ${amenitiesList}` : '') +
                  (rulesList ? `\n\n📋 Reglas:\n${rulesList}` : ''),
              });
            } else {
              // Multiple properties
              const list = props.map(p =>
                `• *${p.name}* — $${parseFloat(p.pricePerNight)}/noche, ${p.capacity} huéspedes, ${p.bedrooms} hab`
              ).join('\n');
              return JSON.stringify({
                success: true,
                properties: props.map(p => ({ id: p.id, name: p.name, price: p.pricePerNight, capacity: p.capacity })),
                message: `Tenemos ${props.length} propiedades disponibles:\n\n${list}\n\n¿Cuál te interesa? Puedo darte más detalles de cualquiera.`,
              });
            }
          }

          // Fallback: use products + KB
          const products = await this.productsService.findAll(schemaName, true);
          const kbContext = await this.knowledgeBase.buildKnowledgeContext(schemaName);
          const property = products[0];

          return JSON.stringify({
            success: true,
            property: { name: property?.name ?? 'Propiedad', price: property?.price },
            message: `${property?.name ?? 'Propiedad'}: $${property?.price ?? 0}/noche. ${property?.description ?? ''}`,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al obtener info: ${err.message}` });
        }
      }

      case 'send_media_to_customer': {
        try {
          // Get media assets of the requested type
          let assets: any[] = [];
          await this.prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "${schemaName}".media_assets (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              type VARCHAR(50) NOT NULL DEFAULT 'general',
              title VARCHAR(255), url TEXT NOT NULL,
              is_active BOOLEAN NOT NULL DEFAULT true,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `);

          if (args.mediaType === 'product' && args.productName) {
            // Get product images
            const products = await this.productsService.search(args.productName, schemaName);
            if (products[0]?.images?.length > 0) {
              assets = products[0].images.map((url: string) => ({ url, title: products[0].name }));
            }
          } else {
            assets = await this.prisma.$queryRawUnsafe<any[]>(`
              SELECT url, title FROM "${schemaName}".media_assets
              WHERE type = $1 AND is_active = true
              ORDER BY sort_order ASC, created_at DESC LIMIT 5
            `, args.mediaType);
          }

          if (assets.length === 0) {
            return JSON.stringify({ success: false, message: `No hay material de tipo "${args.mediaType}" configurado.` });
          }

          // Send the first image via WhatsApp
          const customerChannelId = (conversation.context as any)?.senderPhone;
          if (customerChannelId) {
            const axios = (await import('axios')).default;
            const channelRows = await this.prisma.$queryRawUnsafe<any[]>(
              `SELECT external_id, access_token FROM "${schemaName}".channels WHERE type = 'whatsapp' AND is_active = true LIMIT 1`
            );

            if (channelRows[0] && assets[0].url && !assets[0].url.startsWith('data:')) {
              // Send image via Meta API with URL
              await axios.post(
                `https://graph.facebook.com/v19.0/${channelRows[0].external_id}/messages`,
                {
                  messaging_product: 'whatsapp',
                  to: customerChannelId,
                  type: 'image',
                  image: { link: assets[0].url, caption: assets[0].title ?? '' },
                },
                { headers: { Authorization: `Bearer ${channelRows[0].access_token}` } },
              ).catch(() => {});
            }
          }

          return JSON.stringify({
            success: true,
            sent: assets.length,
            message: `Material enviado: ${assets[0].title ?? args.mediaType}`,
          });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: `Error al enviar material: ${err.message}` });
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
             custom_instructions AS "customInstructions",
             agent_config->'objectives' AS "objectives",
             agent_config->'redLines' AS "redLines"
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
- Si el cliente está frustrado o tiene una queja que no puedes resolver, usa escalate_complaint
- Si el cliente quiere cancelar un pedido, usa cancel_order (pide el motivo primero)

REGLAS CRÍTICAS — NUNCA las violes:
1. NUNCA digas "voy a contactar a un humano" sin EJECUTAR la tool escalate_complaint. Si dices que escalarás, DEBES ejecutar la herramienta.
2. NUNCA inventes información (precios, productos, horarios) que no esté en el catálogo o knowledge base.
3. NUNCA pierdas el contexto del pedido actual. Si ya tienes el nombre del cliente, NO lo pidas de nuevo.
4. Si una tool falla, informa al cliente del error técnico y EJECUTA escalate_complaint para que el dueño intervenga.
5. Si el cliente envía una IMAGEN durante el flujo de entrega/dirección, es una REFERENCIA VISUAL de su casa/ubicación. Guárdala como referencia, NO comentes la foto de forma casual.
6. Si el cliente envía una imagen y hay un pedido con status payment_pending, es un COMPROBANTE DE PAGO. No es una foto casual.

FLUJO DE PEDIDO — SIEMPRE SIGUE ESTE ORDEN:
1. Confirma los productos y cantidades con el cliente
2. Pregunta el NOMBRE del cliente si no lo tienes (si ya está en la memoria, NO lo pidas)
3. Usa create_order para registrar el pedido
4. Pregunta: "¿Pasas a recoger o te lo enviamos a domicilio?"
5. Si es ENVÍO:
   - Informa que el envío tiene un costo adicional (según configuración del negocio)
   - Pide la dirección escrita (calle, colonia, referencias)
   - Pide que envíe su UBICACIÓN por WhatsApp (el pin/📍) para el repartidor
   - Usa set_delivery_address con la dirección y coordenadas (usa el orderId del pedido que acabas de crear)
   - Si el cliente envía una IMAGEN después de dar la dirección, es una referencia visual de su casa — menciona que la guardaste como referencia
   - El costo de envío se suma automáticamente al total
6. Si es RECOGER: confirma que pase cuando esté listo
7. Solicita el pago: da los datos bancarios (si los tienes configurados) y pide comprobante de transferencia
8. Cuando el cliente mande imagen de transferencia, se verifica automáticamente
9. Guarda el nombre y dirección en la memoria del cliente (update_customer_memory)

MANEJO DE ERRORES:
- Si set_delivery_address falla: intenta de nuevo con el orderId del pedido activo. Si sigue fallando, usa escalate_complaint.
- Si create_order falla: informa al cliente y usa escalate_complaint.
- NUNCA digas "contactaré a un humano" sin ejecutar escalate_complaint inmediatamente.
- Si no puedes resolver algo en 2 intentos, escala con escalate_complaint.

MEMORIA — IMPORTANTE:
- USA update_customer_memory ACTIVAMENTE para guardar datos del cliente:
  - memory_type "profile", category "addresses": cuando el cliente dé su nombre, dirección, preferencias
  - memory_type "episode": cuando detectes intereses, quejas, contexto relevante
- Si la MEMORIA DEL CLIENTE ya tiene su nombre/dirección, NO lo pidas de nuevo. Usa los datos que ya tienes.
- Guarda la memoria DURANTE la conversación, no esperes al final.
- SIEMPRE que el cliente dé información nueva (nombre, dirección, preferencia), guárdala inmediatamente.

CATÁLOGO DISPONIBLE:
${productList || 'No hay productos disponibles en este momento.'}

MATERIAL GRÁFICO:
- Si el cliente pide el MENÚ, usa send_media_to_customer con mediaType "menu"
- Si pregunta por PROMOCIONES, usa send_media_to_customer con mediaType "promo"
- Si quiere ver la FOTO de un producto específico, usa send_media_to_customer con mediaType "product" y productName
- Si pide el CATÁLOGO completo, usa send_media_to_customer con mediaType "catalog"
- SIEMPRE envía el material si está disponible. Si no hay material configurado, infórmale al cliente.

${aiConfig.customInstructions ? `INSTRUCCIONES ADICIONALES:\n${aiConfig.customInstructions}` : ''}
${aiConfig.objectives?.length ? `\nOBJETIVOS DEL AGENTE:\n${aiConfig.objectives.map((o: string) => `- ${o}`).join('\n')}` : ''}
${aiConfig.redLines?.length ? `\nLÍNEAS ROJAS — NUNCA hagas esto:\n${aiConfig.redLines.map((r: string) => `❌ ${r}`).join('\n')}` : ''}`.trim();
  }

  /**
   * System prompt for when the OWNER of a business messages Max.
   * Max stays as Max (VSPRO admin assistant), NOT as the tenant's customer-facing agent.
   */
  private buildOwnerSystemPrompt(tenant: any, products: any[]): string {
    const productList = products
      .slice(0, 30)
      .map((p: any) => `- ${p.name}: $${p.price}`)
      .join('\n');

    return `Eres Max, el asistente administrativo de VSPRO.
Estás hablando con el DUEÑO del negocio "${tenant.businessName}".
Tu rol es ayudarle a ADMINISTRAR su negocio, NO a tomar pedidos de clientes.
Responde SIEMPRE en español. Sé profesional pero amigable.

LO QUE PUEDES HACER POR EL DUEÑO:
- Agregar productos a su catálogo (usa add_product)
- Configurar horarios (usa set_business_hours)
- Configurar datos bancarios (usa set_payment_info)
- Registrar repartidores (usa add_delivery_driver)
- Generar reportes de ventas (usa generate_report)
- Ver estado de pedidos (usa get_order_status)
- Responder preguntas sobre su negocio en VSPRO

LO QUE NO DEBES HACER:
- NO tomes pedidos (esto es el dueño, no un cliente)
- NO uses create_order (el dueño no está comprando)
- NO uses request_payment (el dueño no va a pagar un pedido)
- NO te presentes como el agente de su negocio — eres Max de VSPRO

SI EL DUEÑO MANDA UNA IMAGEN (como un menú):
- Analiza la imagen y extrae los productos con precios
- Usa add_product para cada producto detectado
- Confirma lo que agregaste

CATÁLOGO ACTUAL DEL NEGOCIO (${products.length} productos):
${productList || 'Sin productos aún — ayuda al dueño a agregar su catálogo.'}

Siempre confirma antes de agregar productos. Si no estás seguro del precio, pregunta.`.trim();
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
