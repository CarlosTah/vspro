# Fase 1 — Schema Completo del Tenant

> Documentación de lo implementado en la Fase 1, Semanas 3-4.
> Cubre el schema de base de datos de cada tenant y el sistema de provisioning.

---

## Estado: ✅ COMPLETADA (Semanas 3-4)

**Objetivo:** Definir y crear automáticamente todas las tablas de negocio de cada tenant al momento de su registro.

---

## 1. Arquitectura del Schema por Tenant

Cada PYME (tenant) tiene su propio schema PostgreSQL aislado. El schema se crea automáticamente cuando la PYME se registra en la plataforma.

```
PostgreSQL: vspro_db
├── public                    ← Tablas globales (plans, tenants, subscriptions...)
├── tenant_7r2anau            ← Tortillería Don José
│   ├── users
│   ├── products
│   ├── orders
│   └── ... (12 tablas)
├── tenant_h16rnds            ← Panadería La Esperanza
│   └── ... (12 tablas)
└── tenant_tj4xefb            ← Paletería Reyes
    └── ... (12 tablas)
```

---

## 2. Tablas del Schema de Tenant

Archivo fuente: `packages/database/prisma/tenant-schema.sql`

### `users` — Usuarios de la PYME

```sql
id            UUID PK
email         VARCHAR(255) UNIQUE NOT NULL
password_hash VARCHAR(255) NOT NULL
name          VARCHAR(255) NOT NULL
role          VARCHAR(50) DEFAULT 'admin'   -- admin | sales | production | accounting | viewer
is_active     BOOLEAN DEFAULT true
created_at    TIMESTAMPTZ DEFAULT NOW()
last_login_at TIMESTAMPTZ
```

### `channels` — Canales de mensajería conectados

```sql
id                   UUID PK
type                 VARCHAR(50)    -- whatsapp | messenger | instagram
external_id          VARCHAR(255)   -- Phone Number ID / Page ID de Meta
access_token         TEXT           -- encriptado en la aplicación
webhook_verify_token VARCHAR(255)
is_active            BOOLEAN DEFAULT true
config               JSONB DEFAULT '{}'
created_at           TIMESTAMPTZ DEFAULT NOW()
```

### `customers` — Clientes de la PYME

```sql
id           UUID PK
name         VARCHAR(255)
phone        VARCHAR(50)
email        VARCHAR(255)
channel_type VARCHAR(50)    -- canal por donde llegó el cliente
channel_id   VARCHAR(255)   -- ID en el canal (wa_id, psid, instagram_id)
address      JSONB
notes        TEXT
created_at   TIMESTAMPTZ DEFAULT NOW()
UNIQUE(channel_type, channel_id)
```

### `products` — Catálogo de productos

```sql
id          UUID PK
sku         VARCHAR(100) UNIQUE
name        VARCHAR(255) NOT NULL
description TEXT
price       DECIMAL(10,2) DEFAULT 0
category    VARCHAR(100)
images      TEXT[]         -- URLs en S3
is_active   BOOLEAN DEFAULT true
embedding   vector(1536)   -- para búsqueda semántica con pgvector
created_at  TIMESTAMPTZ DEFAULT NOW()
updated_at  TIMESTAMPTZ DEFAULT NOW()
```

### `inventory` — Stock por producto

```sql
id              UUID PK
product_id      UUID FK → products (CASCADE)
stock_available INTEGER DEFAULT 0
stock_reserved  INTEGER DEFAULT 0   -- pedidos confirmados no entregados
stock_minimum   INTEGER DEFAULT 5   -- umbral de alerta de stock bajo
updated_at      TIMESTAMPTZ DEFAULT NOW()
UNIQUE(product_id)
```

### `orders` — Pedidos

```sql
id               UUID PK
order_number     VARCHAR(50) UNIQUE   -- "ORD-2024-00001"
customer_id      UUID FK → customers
channel_type     VARCHAR(50)
status           VARCHAR(50) DEFAULT 'new'
items            JSONB DEFAULT '[]'   -- [{product_id, name, qty, unit_price, subtotal}]
subtotal         DECIMAL(10,2) DEFAULT 0
shipping_cost    DECIMAL(10,2) DEFAULT 0
total            DECIMAL(10,2) DEFAULT 0
notes            TEXT
shipping_address JSONB
assigned_to      UUID FK → users (nullable)
created_at       TIMESTAMPTZ DEFAULT NOW()
updated_at       TIMESTAMPTZ DEFAULT NOW()
```

**Estados válidos del pedido:**

```
new → quoted → payment_pending → payment_verified
   → in_production → ready → shipped → delivered
   → cancelled (desde cualquier estado activo)
```

### `payments` — Pagos y comprobantes

```sql
id              UUID PK
order_id        UUID FK → orders
method          VARCHAR(50)    -- transfer | stripe | mercadopago | cash
amount          DECIMAL(10,2)
status          VARCHAR(50) DEFAULT 'pending'  -- pending | verified | rejected
reference       VARCHAR(255)   -- número de referencia bancaria
proof_image_url TEXT           -- URL del comprobante en S3
ocr_data        JSONB          -- datos extraídos por GPT-4o Vision
verified_by     UUID FK → users (nullable, null = verificación automática)
verified_at     TIMESTAMPTZ
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### `conversations` — Hilos de conversación

```sql
id                UUID PK
customer_id       UUID FK → customers
channel_type      VARCHAR(50)
channel_thread_id VARCHAR(255)   -- ID del hilo en el canal
status            VARCHAR(50) DEFAULT 'active'  -- active | resolved | waiting
context           JSONB DEFAULT '{}'  -- estado de la conversación para la IA
last_message_at   TIMESTAMPTZ
created_at        TIMESTAMPTZ DEFAULT NOW()
```

### `messages` — Mensajes individuales

```sql
id              UUID PK
conversation_id UUID FK → conversations
direction       VARCHAR(20)   -- inbound | outbound
type            VARCHAR(50) DEFAULT 'text'  -- text | image | audio | document
content         TEXT
media_url       TEXT
external_id     VARCHAR(255)  -- ID del mensaje en el canal (para deduplicación)
ai_processed    BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### `shipments` — Envíos

```sql
id                 UUID PK
order_id           UUID FK → orders
carrier            VARCHAR(100)   -- "FedEx", "DHL", "Estafeta"
tracking_number    VARCHAR(255)
tracking_url       TEXT
status             VARCHAR(50) DEFAULT 'pending'
estimated_delivery DATE
created_at         TIMESTAMPTZ DEFAULT NOW()
```

### `accounting_entries` — Registro contable

```sql
id          UUID PK
order_id    UUID FK → orders (nullable)
type        VARCHAR(50)   -- sale | refund | adjustment
amount      DECIMAL(10,2)
tax_amount  DECIMAL(10,2) DEFAULT 0
description TEXT
invoice_id  VARCHAR(255)  -- ID en Facturapi si se generó CFDI
created_at  TIMESTAMPTZ DEFAULT NOW()
```

### `ai_config` — Configuración del asistente IA

```sql
id                  UUID PK
assistant_name      VARCHAR(100) DEFAULT 'Asistente'
tone                VARCHAR(50) DEFAULT 'friendly'  -- formal | casual | friendly
welcome_message     TEXT
away_message        TEXT   -- respuesta fuera de horario
language            VARCHAR(10) DEFAULT 'es'
business_hours      JSONB DEFAULT '{}'  -- {mon: {open: "09:00", close: "18:00"}}
custom_instructions TEXT
updated_at          TIMESTAMPTZ DEFAULT NOW()
```

---

## 3. Índices

8 índices creados para optimizar las consultas más frecuentes:

| Índice | Tabla | Columnas | Propósito |
|--------|-------|----------|-----------|
| `idx_orders_customer` | orders | customer_id | Pedidos por cliente |
| `idx_orders_status` | orders | status | Filtrar por estado |
| `idx_orders_created` | orders | created_at DESC | Listado cronológico |
| `idx_messages_conv` | messages | conversation_id | Mensajes de una conversación |
| `idx_conversations_cust` | conversations | customer_id | Conversaciones de un cliente |
| `idx_customers_channel` | customers | channel_type, channel_id | Lookup por canal |
| `idx_products_active` | products | is_active | Catálogo activo |
| `idx_payments_order` | payments | order_id | Pagos de un pedido |

---

## 4. Sistema de Provisioning

### Flujo completo al registrar una PYME

```
POST /tenants/register
        │
        ▼
1. Verificar slug único
        │
        ▼
2. Obtener plan 'basic' activo
        │
        ▼
3. Transacción en schema público:
   ├── INSERT tenants
   └── INSERT subscriptions (status: TRIALING)
        │
        ▼
4. CREATE SCHEMA "tenant_xxxxx"
        │
        ▼
5. Ejecutar tenant-schema.sql
   (12 tablas + 8 índices)
        │
        ▼
6. INSERT users (admin inicial con bcrypt hash)
        │
        ▼
7. INSERT ai_config (configuración por defecto)
        │
        ▼
Respuesta: datos del tenant creado
```

### Archivo SQL del tenant

`packages/database/prisma/tenant-schema.sql` — contiene el DDL completo con el placeholder `{{schema}}` que se reemplaza dinámicamente por el `schemaName` del tenant.

El servicio de provisioning:
1. Lee el archivo SQL una vez al iniciar (en el constructor)
2. Reemplaza `{{schema}}` con el nombre real
3. Elimina comentarios de línea (`--`)
4. Divide por `;` y ejecuta cada statement individualmente

> **Por qué statements individuales:** `$executeRawUnsafe` de Prisma no soporta múltiples statements separados por `;` en una sola llamada.

### Deprovision (cancelación)

```
1. UPDATE tenants SET status = 'CANCELLED'
2. DROP SCHEMA "tenant_xxxxx" CASCADE
```

El paso 1 ocurre primero para que, si el DROP falla, el tenant quede marcado como cancelado y no pueda autenticarse.

---

## 5. Verificación

### Confirmar tablas de un tenant

```bash
docker exec vspro_postgres psql -U vspro -d vspro_db \
  -c "\dt tenant_7r2anau.*"
```

Resultado esperado: 12 tablas.

### Confirmar todos los schemas

```bash
docker exec vspro_postgres psql -U vspro -d vspro_db -c "
SELECT schemaname, COUNT(*) as tablas
FROM pg_tables
WHERE schemaname LIKE 'tenant_%'
GROUP BY schemaname
ORDER BY schemaname;"
```

### Registrar un tenant nuevo y verificar

```bash
# Registrar
curl -s -X POST http://localhost:3001/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "mi-negocio",
    "businessName": "Mi Negocio",
    "email": "admin@minegocio.com",
    "ownerName": "Juan Pérez",
    "password": "Password123!"
  }'

# El campo schemaName en la respuesta es el schema creado
# Verificar sus tablas:
docker exec vspro_postgres psql -U vspro -d vspro_db \
  -c "\dt <schemaName>.*"
```

---

## 6. Pendiente para Fases Siguientes

| Tarea | Fase |
|-------|------|
| Implementar `ProductsModule` (CRUD + búsqueda semántica) | Fase 1 Sem 7-8 |
| Implementar `CustomersModule` | Fase 1 Sem 7-8 |
| Implementar `OrdersModule` con máquina de estados | Fase 1 Sem 9-10 |
| Implementar `PaymentsModule` con OCR de comprobantes | Fase 1 Sem 9-10 |
| Implementar `ConversationsModule` + `MessagesModule` | Fase 1 Sem 7-8 |
| Motor de IA con Function Calling | Fase 1 Sem 7-8 |
| Integración WhatsApp (webhooks + envío) | Fase 1 Sem 7-8 |
| Billing con Stripe | Fase 1 Sem 11-12 |
| Panel admin (Next.js) | Fase 1 Sem 11-12 |
