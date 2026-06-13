# Fase 1 — Módulos de Negocio

> Documentación de lo implementado en la Fase 1, Semanas 7-10.
> Cubre los 7 módulos de negocio core y el flujo completo de mensajería con IA.

---

## Estado: ✅ COMPLETADA (Semanas 7-10)

**Objetivo:** Implementar los módulos de negocio sobre el schema del tenant y conectar el flujo completo: mensaje de WhatsApp → IA → pedido → pago → confirmación.

---

## Módulos implementados

| Módulo | Endpoints | Estado |
|--------|-----------|--------|
| `ProductsModule` | 7 endpoints | ✅ |
| `CustomersModule` | 5 endpoints | ✅ |
| `OrdersModule` | 12 endpoints | ✅ |
| `PaymentsModule` | 4 endpoints | ✅ |
| `ConversationsModule` | 4 endpoints | ✅ |
| `MessagingService` | Servicio interno | ✅ |
| `AiEngineService` | Servicio interno | ✅ |
| `MessageProcessor` | Worker BullMQ | ✅ |

---

## 1. ProductsModule

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/products` | Lista todos los productos con stock. `?all=true` incluye inactivos |
| `GET` | `/products/low-stock` | Productos con stock ≤ mínimo configurado |
| `GET` | `/products/search?q=` | Búsqueda por nombre, SKU o categoría (ILIKE) |
| `GET` | `/products/:id` | Detalle de un producto con stock actual |
| `POST` | `/products` | Crear producto (crea registro de inventario automáticamente) |
| `PATCH` | `/products/:id` | Actualizar campos del producto (PATCH parcial) |
| `PATCH` | `/products/:id/stock` | Actualizar stock disponible y mínimo |
| `DELETE` | `/products/:id` | Soft delete — marca `is_active = false` |

### Comportamiento clave

- Al crear un producto, se inserta automáticamente un registro en `inventory` con `stock_available = 0`
- El DELETE es soft — el producto queda en BD pero no aparece en el catálogo ni en búsquedas
- El endpoint `/search` usa `ILIKE` para búsqueda case-insensitive en nombre, descripción, SKU y categoría
- Todos los queries hacen JOIN con `inventory` para devolver stock en la misma respuesta

### Ejemplo de respuesta

```json
{
  "id": "uuid",
  "sku": "TORT-001",
  "name": "Tortilla de maíz 1kg",
  "price": "25",
  "category": "Tortillas",
  "isActive": true,
  "stockAvailable": 97,
  "stockReserved": 3,
  "stockMinimum": 10
}
```

---

## 2. CustomersModule

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/customers` | Lista todos los clientes |
| `GET` | `/customers/:id` | Detalle de un cliente |
| `GET` | `/customers/:id/orders` | Historial de pedidos del cliente |
| `POST` | `/customers` | Crear cliente manualmente |
| `PATCH` | `/customers/:id` | Actualizar datos del cliente |

### Método interno: `findOrCreateByChannel`

Este método es el más importante del módulo. Lo usa el `MessageProcessor` cada vez que llega un mensaje nuevo:

```
Llega mensaje de WhatsApp desde 5215512345678
  → buscar en customers WHERE channel_type='whatsapp' AND channel_id='5215512345678'
  → si existe: retornar cliente
  → si no existe: crear cliente nuevo con el nombre del perfil de WhatsApp
```

Garantiza que cada número de WhatsApp/Messenger/Instagram tenga exactamente un registro de cliente.

---

## 3. OrdersModule

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/orders` | Lista pedidos. `?status=new` filtra por estado |
| `GET` | `/orders/:id` | Detalle completo del pedido |
| `POST` | `/orders` | Crear pedido |
| `POST` | `/orders/:id/quote` | `new → quoted` |
| `POST` | `/orders/:id/request-payment` | `quoted → payment_pending` |
| `POST` | `/orders/:id/verify-payment` | `payment_pending → payment_verified` |
| `POST` | `/orders/:id/start-production` | `payment_verified → in_production` |
| `POST` | `/orders/:id/mark-ready` | `in_production → ready` |
| `POST` | `/orders/:id/ship` | `ready → shipped` |
| `POST` | `/orders/:id/deliver` | `shipped → delivered` |
| `POST` | `/orders/:id/cancel` | Cancelar desde cualquier estado activo |
| `PATCH` | `/orders/:id/shipping-address` | Actualizar dirección de envío |

### Máquina de estados

```
new → quoted → payment_pending → payment_verified
   → in_production → ready → shipped → delivered

Desde cualquier estado activo → cancelled
```

Las transiciones inválidas retornan `HTTP 422` con código `INVALID_STATE_TRANSITION`.

### Gestión de stock

Al **crear** un pedido:
- Verifica que hay stock suficiente para cada producto
- Descuenta de `stock_available` y suma a `stock_reserved`

Al **cancelar** un pedido:
- Libera el stock reservado: suma a `stock_available`, resta de `stock_reserved`

### Numeración automática

Los pedidos se numeran como `ORD-{AÑO}-{SECUENCIA}` (ej: `ORD-2026-00001`). La secuencia se calcula contando pedidos del año en curso.

### Creación de pedido — validaciones

1. Verificar que el cliente existe
2. Para cada producto: verificar que existe, está activo y tiene stock suficiente
3. Calcular subtotal y total
4. Crear pedido en estado `new`
5. Reservar stock

---

## 4. PaymentsModule

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/payments/order/:orderId` | Historial de pagos de un pedido |
| `POST` | `/payments/verify-by-image` | Verificación automática por OCR (GPT-4o Vision) |
| `POST` | `/payments/verify-manual` | Verificación manual por operador |
| `PATCH` | `/payments/:id/reject` | Rechazar pago pendiente de revisión |

### Flujo de verificación por imagen

```
Cliente envía imagen del comprobante
  → POST /payments/verify-by-image { orderId, proofImageUrl }
  → GPT-4o Vision extrae: amount, bank, reference, date, senderName
  → Comparar amount con order.total (tolerancia ±$1)
  → Si coincide:
      - payment.status = 'verified'
      - order.status → 'payment_verified' (automático)
      - Retorna: { verified: true, message: "✅ Pago verificado..." }
  → Si no coincide:
      - payment.status = 'pending_review'
      - order.status sin cambio
      - Retorna: { verified: false, message: "⚠️ El monto no coincide..." }
```

### Tolerancia de monto

Se acepta una diferencia de hasta **$1.00** entre el monto del comprobante y el total del pedido, para cubrir redondeos bancarios.

### Modo desarrollo (sin API key de OpenAI)

Cuando `OPENAI_API_KEY` no está configurada o es `sk-test-not-real`, el OCR retorna un resultado simulado con `amount: 999.99`. Esto permite probar el flujo sin consumir créditos de OpenAI.

### Datos guardados por pago

```json
{
  "method": "transfer",
  "amount": 350.00,
  "status": "verified",
  "reference": "REF123456",
  "proofImageUrl": "https://s3.../comprobante.jpg",
  "ocrData": {
    "amount": 350.00,
    "senderBank": "BBVA México",
    "receiverBank": "Banamex",
    "reference": "REF123456",
    "date": "2026-05-06",
    "senderName": "María García",
    "confidence": "high"
  },
  "verifiedAt": "2026-05-06T15:00:00Z"
}
```

---

## 5. ConversationsModule

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/conversations` | Lista conversaciones con último mensaje. `?status=active` |
| `GET` | `/conversations/:id` | Detalle con datos del cliente |
| `GET` | `/conversations/:id/messages` | Historial de mensajes. `?limit=50` |
| `POST` | `/conversations/:id/resolve` | Marcar conversación como resuelta |

### Método interno: `findOrCreate`

Busca una conversación activa del cliente en el canal indicado. Si no existe, crea una nueva. Garantiza que no se dupliquen conversaciones para el mismo cliente.

### Método interno: `saveMessage`

Guarda un mensaje (inbound u outbound) y actualiza `last_message_at` en la conversación. Se usa tanto para mensajes entrantes como para las respuestas de la IA.

---

## 6. MessagingService

Servicio interno que abstrae los tres canales de Meta en una interfaz unificada.

### Parseo de mensajes entrantes

```typescript
parseIncoming(payload: any): IncomingMessage | null
```

Detecta el canal por `payload.object`:
- `whatsapp_business_account` → parsea como WhatsApp
- `page` → parsea como Messenger
- `instagram` → parsea como Instagram DM

Retorna un `IncomingMessage` normalizado independiente del canal:

```typescript
{
  channelType: 'whatsapp' | 'messenger' | 'instagram',
  senderId: string,       // wa_id, psid, etc.
  senderName?: string,
  messageId: string,
  type: 'text' | 'image' | 'audio' | 'document',
  text?: string,
  mediaUrl?: string,
  timestamp: Date,
  raw: any               // payload original
}
```

### Envío de mensajes

```typescript
sendText(channelType, recipientId, text, schemaName): Promise<void>
```

Obtiene el canal activo del tenant desde la BD (`channels` table), extrae el `access_token` y llama a la API de Meta correspondiente.

---

## 7. AiEngineService

Motor de IA que procesa mensajes y genera respuestas usando GPT-4o con Function Calling.

### Herramientas disponibles (Function Calling)

| Herramienta | Cuándo la usa la IA | Qué hace |
|-------------|---------------------|----------|
| `check_product_availability` | Cliente pregunta por un producto | Busca en el catálogo y retorna precio y stock |
| `get_order_status` | Cliente pregunta por su pedido | Busca por número de pedido y retorna estado |
| `create_order` | Cliente confirma lo que quiere pedir | Crea el pedido en la BD y reserva stock |
| `request_payment` | Pedido listo para cobrar | Avanza a `payment_pending` y da instrucciones |

### Flujo de procesamiento

```
1. Cargar historial de conversación (últimos 10 mensajes)
2. Cargar configuración de IA del tenant (nombre, tono, instrucciones)
3. Cargar catálogo activo (máx 20 productos en el prompt)
4. Construir system prompt dinámico con contexto del negocio
5. Llamar a GPT-4o con tools disponibles
6. Si GPT llama una tool → ejecutar → segunda llamada con resultado
7. Retornar texto de respuesta
```

### System prompt dinámico

El prompt se construye con:
- Nombre del asistente y tono (configurados por el tenant)
- Catálogo de productos con precios y disponibilidad
- Instrucciones adicionales del tenant
- Idioma (español por defecto)

### Modo desarrollo

Sin `OPENAI_API_KEY` real, el servicio retorna respuestas predefinidas basadas en palabras clave del mensaje (`hola`, `precio`, `pedido`). Permite desarrollar y probar sin consumir créditos.

---

## 8. MessageProcessor (BullMQ Worker)

Procesa los mensajes de la cola `messages` de forma asíncrona.

### Flujo completo

```
Job: { tenantSlug, payload }
  │
  ▼
1. Resolver tenant por slug (verificar activo)
  │
  ▼
2. Parsear mensaje con MessagingService.parseIncoming()
  │
  ▼
3. findOrCreateByChannel() → Customer
  │
  ▼
4. ConversationsService.findOrCreate() → Conversation
  │
  ▼
5. saveMessage(inbound) → guardar mensaje del cliente
  │
  ▼
6. AiEngineService.processMessage() → respuesta de IA
  │
  ▼
7. MessagingService.sendText() → enviar respuesta al cliente
  │
  ▼
8. saveMessage(outbound) → guardar respuesta
  │
  ▼
9. updateContext() → guardar estado de la conversación
```

### Configuración de reintentos

```typescript
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 }  // 2s, 4s, 8s
}
```

Si el job falla 3 veces, queda en la cola de `failed` para inspección manual.

---

## 9. Webhook de Meta — Verificación de Firma HMAC

### Problema encontrado y resuelto

**Problema:** NestJS parsea el body JSON antes de que llegue al controller. Al re-serializar con `JSON.stringify()` para calcular la firma, el resultado puede diferir del body original (espacios, orden de claves), causando que la firma no coincida.

**Solución:** Usar `rawBody` de Express (habilitado con `rawBody: true` en `NestFactory.create()`). El controller recibe el buffer original sin modificar:

```typescript
@Post('meta/:tenantSlug')
async receiveMessage(
  @Req() req: RawBodyRequest<Request>,
  @Body() payload: unknown,
  @Headers('x-hub-signature-256') signature: string,
) {
  const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(payload));
  await this.webhooksService.verifySignature(rawBody, signature);
  // ...
}
```

---

## 10. Endpoints disponibles — Resumen completo

```
GET    /health

POST   /auth/login
GET    /auth/me

POST   /tenants/register

GET    /products
GET    /products/low-stock
GET    /products/search?q=
GET    /products/:id
POST   /products
PATCH  /products/:id
PATCH  /products/:id/stock
DELETE /products/:id

GET    /customers
GET    /customers/:id
GET    /customers/:id/orders
POST   /customers
PATCH  /customers/:id

GET    /orders?status=
GET    /orders/:id
POST   /orders
POST   /orders/:id/quote
POST   /orders/:id/request-payment
POST   /orders/:id/verify-payment
POST   /orders/:id/start-production
POST   /orders/:id/mark-ready
POST   /orders/:id/ship
POST   /orders/:id/deliver
POST   /orders/:id/cancel
PATCH  /orders/:id/shipping-address

GET    /payments/order/:orderId
POST   /payments/verify-by-image
POST   /payments/verify-manual
PATCH  /payments/:id/reject

GET    /conversations?status=
GET    /conversations/:id
GET    /conversations/:id/messages?limit=
POST   /conversations/:id/resolve

GET    /webhooks/meta/:tenantSlug   (verificación Meta)
POST   /webhooks/meta/:tenantSlug   (mensajes entrantes)
```

---

## 11. Bugs encontrados y corregidos

| Bug | Causa | Fix |
|-----|-------|-----|
| `column "images" is of type text[] but expression is of type text` | PostgreSQL no acepta string como array | Usar `$1::text[]` con array nativo |
| `operator does not exist: uuid = text` | PostgreSQL requiere cast explícito para UUIDs | Agregar `::uuid` en todos los `WHERE id = $1` |
| `column "customer_id" is of type uuid but expression is of type text` | Mismo problema en INSERT | Agregar `$2::uuid` en INSERT de orders |
| Firma HMAC inválida en webhook | Body re-serializado difiere del original | Usar `req.rawBody` (Buffer) en lugar de `JSON.stringify(payload)` |
| `validate(payload, req)` en JwtStrategy | Con `passReqToCallback: true`, Passport invierte el orden | Corregir a `validate(req, payload)` |

---

## 12. Pruebas realizadas

### Flujo completo verificado manualmente

```
1. POST /products          → Tortilla de maíz 1kg, $25
2. PATCH /products/:id/stock → 100 unidades disponibles
3. POST /customers         → Ana Martinez, WhatsApp 5215598765432
4. POST /orders            → 3 unidades → ORD-2026-00001, total $75
   → stock: disponible 97, reservado 3
5. POST /orders/:id/quote  → status: quoted
6. POST /orders/:id/request-payment → status: payment_pending
7. POST /payments/verify-manual → verified: true, status: payment_verified
8. POST /orders/:id/start-production → status: in_production
9. POST /orders/:id/mark-ready → status: ready
10. POST /orders/:id/ship  → status: shipped
11. Transición inválida (payment_pending → shipped) → HTTP 422 INVALID_STATE_TRANSITION ✅
```

### Flujo de webhook verificado

```
1. Calcular firma HMAC-SHA256 del payload con META_APP_SECRET
2. POST /webhooks/meta/tortilleria-don-jose con header x-hub-signature-256
3. HTTP 200 inmediato ✅
4. BullMQ procesa el job en background
5. Cliente "Maria Lopez" creado automáticamente ✅
6. Conversación activa creada ✅
7. Mensaje inbound guardado ✅
8. IA genera respuesta (modo dev) ✅
9. Mensaje outbound guardado ✅
10. GET /conversations → 1 conversación con 2 mensajes ✅
```

---

## 13. Pendiente para próximas sesiones

| Módulo | Descripción | Prioridad |
|--------|-------------|-----------|
| `ProductionModule` | Cola de producción, notificación al cliente cuando pedido está listo | Alta |
| `ShipmentsModule` | Integración con paqueterías, tracking | Alta |
| `BillingModule` | Stripe, suscripciones, quotas | Alta |
| Panel admin (Next.js) | Dashboard, gestión de pedidos, conversaciones | Media |
| Conectar canal WhatsApp real | Configurar `channels` table con token real de Meta | Media |
| `AccountingModule` | Registro contable automático, CFDI | Media |
