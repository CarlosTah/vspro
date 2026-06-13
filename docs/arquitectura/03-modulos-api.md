# Módulos del API — NestJS

## Estructura de Módulos

```
apps/api/src/
├── main.ts
├── app.module.ts
│
├── common/                         # Utilidades transversales
│   ├── middleware/
│   │   └── tenant.middleware.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── tenant.guard.ts
│   │   └── plan-feature.guard.ts   # Verifica features del plan
│   ├── decorators/
│   │   ├── tenant.decorator.ts
│   │   └── require-feature.decorator.ts
│   ├── interceptors/
│   │   └── usage-tracker.interceptor.ts  # Registra uso para quotas
│   └── filters/
│       └── global-exception.filter.ts
│
├── modules/
│   ├── auth/                       # Autenticación JWT
│   ├── tenants/                    # Gestión de tenants (super-admin)
│   ├── onboarding/                 # Wizard de configuración inicial
│   ├── billing/                    # Stripe + MercadoPago
│   ├── channels/                   # Conexión de canales de mensajería
│   ├── webhooks/                   # Recepción de mensajes entrantes
│   ├── conversations/              # Gestión de conversaciones
│   ├── ai/                         # Motor de IA
│   ├── orders/                     # Pedidos
│   ├── products/                   # Catálogo
│   ├── inventory/                  # Inventario
│   ├── payments/                   # Cobros y verificación
│   ├── production/                 # Cola de producción
│   ├── shipments/                  # Envíos
│   ├── accounting/                 # Contabilidad
│   ├── customers/                  # Clientes
│   ├── notifications/              # Notificaciones push/email
│   ├── reports/                    # Reportes y métricas
│   └── super-admin/                # Panel de super-administrador
│
└── database/
    └── prisma.service.ts
```

---

## Módulo de Webhooks (Punto de Entrada de Mensajes)

Es el módulo más crítico. Recibe todos los mensajes de Meta y los enruta.

```typescript
// modules/webhooks/webhooks.controller.ts

@Controller('webhooks')
export class WebhooksController {

  // Verificación de webhook (Meta lo llama al configurar)
  @Get('meta/:tenantSlug')
  verifyWebhook(
    @Param('tenantSlug') tenantSlug: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.webhooksService.verify(tenantSlug, mode, token, challenge);
  }

  // Recepción de mensajes entrantes
  @Post('meta/:tenantSlug')
  @HttpCode(200) // Meta requiere 200 inmediato
  async receiveMessage(
    @Param('tenantSlug') tenantSlug: string,
    @Body() payload: MetaWebhookPayload,
    @Headers('x-hub-signature-256') signature: string,
  ) {
    // 1. Verificar firma HMAC (seguridad)
    await this.webhooksService.verifySignature(payload, signature);

    // 2. Encolar para procesamiento asíncrono (no bloquear respuesta a Meta)
    await this.messageQueue.add('process-message', {
      tenantSlug,
      payload,
    });

    return { status: 'ok' };
  }
}
```

---

## Módulo de IA — Motor Conversacional

```typescript
// modules/ai/ai-engine.service.ts

@Injectable()
export class AiEngineService {

  async processMessage(
    tenant: Tenant,
    conversation: Conversation,
    message: string,
    mediaUrl?: string,
  ): Promise<AiResponse> {

    // 1. Cargar contexto de la conversación (últimos N mensajes)
    const history = await this.getConversationHistory(conversation.id);

    // 2. Cargar configuración de IA del tenant
    const aiConfig = await this.getAiConfig(tenant.schemaName);

    // 3. Cargar catálogo relevante (búsqueda semántica)
    const relevantProducts = await this.searchProducts(
      tenant.schemaName,
      message
    );

    // 4. Construir el system prompt dinámico
    const systemPrompt = this.buildSystemPrompt(tenant, aiConfig, relevantProducts);

    // 5. Llamar a GPT-4o
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      {
        role: 'user',
        content: mediaUrl
          ? [
              { type: 'text', text: message },
              { type: 'image_url', image_url: { url: mediaUrl } }
            ]
          : message
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: this.getAvailableTools(), // function calling
      tool_choice: 'auto',
      temperature: 0.3,
    });

    // 6. Procesar tool calls si la IA quiere ejecutar acciones
    return await this.handleToolCalls(tenant, response, conversation);
  }

  // Herramientas disponibles para la IA (Function Calling)
  private getAvailableTools(): ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'create_order',
          description: 'Crear un nuevo pedido cuando el cliente confirma los productos',
          parameters: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    product_id: { type: 'string' },
                    quantity: { type: 'number' },
                  }
                }
              },
              notes: { type: 'string' }
            },
            required: ['items']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'check_product_availability',
          description: 'Verificar disponibilidad y precio de un producto',
          parameters: {
            type: 'object',
            properties: {
              product_name: { type: 'string' }
            },
            required: ['product_name']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_order_status',
          description: 'Consultar el estado de un pedido existente',
          parameters: {
            type: 'object',
            properties: {
              order_number: { type: 'string' }
            },
            required: ['order_number']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'verify_payment_image',
          description: 'Procesar imagen de comprobante de pago enviada por el cliente',
          parameters: {
            type: 'object',
            properties: {
              image_url: { type: 'string' },
              order_id: { type: 'string' }
            },
            required: ['image_url', 'order_id']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'request_shipping_address',
          description: 'Solicitar dirección de envío al cliente',
          parameters: {
            type: 'object',
            properties: {
              order_id: { type: 'string' }
            },
            required: ['order_id']
          }
        }
      }
    ];
  }

  private buildSystemPrompt(
    tenant: Tenant,
    config: AiConfig,
    products: Product[]
  ): string {
    return `
Eres ${config.assistantName}, el asistente virtual de ${tenant.businessName}.
Tu tono es ${config.tone}.

INSTRUCCIONES:
- Ayuda a los clientes a realizar pedidos de forma clara y amigable
- Cuando el cliente quiera pedir algo, usa la herramienta create_order
- Cuando envíen una imagen de pago, usa verify_payment_image
- Si preguntan por disponibilidad, usa check_product_availability
- Responde SIEMPRE en español
- Si no puedes ayudar con algo, ofrece contactar a un humano

CATÁLOGO DISPONIBLE HOY:
${products.map(p => `- ${p.name}: $${p.price} (${p.description})`).join('\n')}

HORARIO DE ATENCIÓN:
${this.formatBusinessHours(config.businessHours)}

${config.customPrompts?.additionalInstructions || ''}
    `.trim();
  }
}
```

---

## Módulo de Pagos — Verificación OCR

```typescript
// modules/payments/payment-verification.service.ts

@Injectable()
export class PaymentVerificationService {

  async verifyTransferProof(
    imageUrl: string,
    orderId: string,
    tenantSchema: string,
  ): Promise<VerificationResult> {

    // 1. Extraer datos del comprobante con GPT-4o Vision
    const ocrResult = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analiza este comprobante de transferencia bancaria y extrae:
            - monto (número)
            - banco emisor
            - banco receptor
            - número de referencia o folio
            - fecha y hora
            - nombre del remitente (si aparece)
            
            Responde SOLO con JSON válido con estas claves:
            { amount, sender_bank, receiver_bank, reference, date, sender_name }
            Si no puedes leer algún campo, usa null.`
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl, detail: 'high' }
          }
        ]
      }],
      response_format: { type: 'json_object' },
    });

    const extracted = JSON.parse(ocrResult.choices[0].message.content);

    // 2. Obtener el pedido para comparar
    const order = await this.ordersService.findById(orderId, tenantSchema);

    // 3. Validar monto (tolerancia de $1 por redondeos)
    const amountMatch = Math.abs(extracted.amount - order.total) <= 1;

    // 4. Registrar resultado
    const payment = await this.paymentsRepo.create({
      orderId,
      method: 'transfer',
      amount: extracted.amount,
      status: amountMatch ? 'verified' : 'pending_review',
      reference: extracted.reference,
      proofImageUrl: imageUrl,
      ocrData: extracted,
    }, tenantSchema);

    if (amountMatch) {
      // 5. Actualizar estado del pedido automáticamente
      await this.ordersService.updateStatus(orderId, 'payment_verified', tenantSchema);

      // 6. Notificar a producción
      await this.productionQueue.add('new-order', { orderId, tenantSchema });

      // 7. Registrar en contabilidad
      await this.accountingService.recordSale(order, payment, tenantSchema);

      return {
        verified: true,
        message: `✅ Pago verificado por $${extracted.amount}. Tu pedido #${order.orderNumber} está en producción.`
      };
    }

    return {
      verified: false,
      message: `⚠️ El monto del comprobante ($${extracted.amount}) no coincide con el total del pedido ($${order.total}). Por favor verifica y envía el comprobante correcto.`
    };
  }
}
```

---

## Módulo de Producción — Flujo de Notificaciones

```typescript
// modules/production/production.service.ts

@Injectable()
export class ProductionService {

  // Operador de producción marca pedido como listo
  async markOrderReady(orderId: string, userId: string, tenantSchema: string) {

    const order = await this.ordersRepo.findById(orderId, tenantSchema);

    // 1. Actualizar estado
    await this.ordersRepo.updateStatus(orderId, 'ready', tenantSchema);

    // 2. Notificar al cliente automáticamente por el canal donde hizo el pedido
    await this.messagingService.sendToCustomer(
      order.customerId,
      order.channelType,
      tenantSchema,
      `🎉 ¡Buenas noticias! Tu pedido #${order.orderNumber} está listo.
      
Para coordinar la entrega, ¿confirmas que tu dirección es:
${this.formatAddress(order.shippingAddress)}?

Responde SÍ para confirmar o escribe tu nueva dirección.`
    );

    // 3. Notificar al equipo de ventas/envíos en el panel
    await this.notificationsService.notifyTeam(tenantSchema, {
      type: 'order_ready',
      orderId,
      message: `Pedido #${order.orderNumber} listo para envío`
    });

    return { success: true };
  }

  // Cuando el cliente confirma dirección → generar envío
  async confirmShippingAddress(
    orderId: string,
    address: ShippingAddress,
    tenantSchema: string,
  ) {
    await this.ordersRepo.updateShippingAddress(orderId, address, tenantSchema);
    await this.ordersRepo.updateStatus(orderId, 'shipped', tenantSchema);

    // Crear registro de envío (integración con paquetería)
    const shipment = await this.shipmentsService.createShipment(
      orderId,
      address,
      tenantSchema
    );

    // Notificar al cliente con número de rastreo
    await this.messagingService.sendToCustomer(
      (await this.ordersRepo.findById(orderId, tenantSchema)).customerId,
      'whatsapp', // canal original
      tenantSchema,
      `📦 Tu pedido está en camino!
      
Número de rastreo: ${shipment.trackingNumber}
Rastrear en: ${shipment.trackingUrl}
Entrega estimada: ${formatDate(shipment.estimatedDelivery)}`
    );
  }
}
```

---

## Guards de Plan y Features

```typescript
// common/guards/plan-feature.guard.ts

@Injectable()
export class PlanFeatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tenant = request.tenant;
    const requiredFeature = this.reflector.get<string>(
      'require_feature',
      context.getHandler()
    );

    if (!requiredFeature) return true;

    const planFeatures = tenant.plan.features;

    // Verificar si el plan incluye la feature
    if (!planFeatures[requiredFeature]) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_IN_PLAN',
        message: `Tu plan actual no incluye esta función`,
        feature: requiredFeature,
        upgradeUrl: `https://app.vspro.app/billing/upgrade`
      });
    }

    return true;
  }
}

// Uso en controllers:
@Get('reports/advanced')
@RequireFeature('advanced_reports')
getAdvancedReports() { ... }

@Post('channels/instagram')
@RequireFeature('instagram_channel')
connectInstagram() { ... }
```
