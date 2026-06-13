# Arquitectura Multi-Tenant

## Estrategia: Schema por Tenant (PostgreSQL)

Cada PYME (tenant) tiene su propio schema dentro de la misma base de datos PostgreSQL.
Esto garantiza aislamiento de datos, facilita backups individuales y cumple con regulaciones de privacidad.

```
PostgreSQL Database: vspro_db
├── schema: public          → Tablas globales (tenants, planes, billing)
├── schema: tenant_abc123   → Datos de "Tortillería Don José"
├── schema: tenant_def456   → Datos de "Panadería La Esperanza"
└── schema: tenant_ghi789   → Datos de "Mueblería Hernández"
```

---

## Modelo de Datos Global (schema: public)

```sql
-- Tenants (PYMEs registradas)
tenants
├── id                UUID PK
├── slug              VARCHAR UNIQUE        -- identificador URL: "tortilleria-don-jose"
├── schema_name       VARCHAR UNIQUE        -- nombre del schema PostgreSQL
├── business_name     VARCHAR
├── owner_email       VARCHAR
├── plan_id           UUID FK → plans
├── status            ENUM(trial, active, suspended, cancelled)
├── trial_ends_at     TIMESTAMP
├── created_at        TIMESTAMP
└── settings          JSONB                 -- configuraciones generales

-- Planes de suscripción
plans
├── id                UUID PK
├── name              VARCHAR               -- "Básico", "Profesional", "Empresarial"
├── price_monthly     DECIMAL
├── price_yearly      DECIMAL
├── features          JSONB                 -- límites y features habilitadas
│   ├── max_orders_per_month: 200
│   ├── max_products: 50
│   ├── max_users: 2
│   ├── channels: ["whatsapp"]
│   ├── ai_enabled: true
│   └── integrations: []
└── is_active         BOOLEAN

-- Suscripciones
subscriptions
├── id                UUID PK
├── tenant_id         UUID FK → tenants
├── plan_id           UUID FK → plans
├── stripe_sub_id     VARCHAR               -- ID en Stripe
├── status            ENUM(trialing, active, past_due, cancelled)
├── current_period_start  TIMESTAMP
├── current_period_end    TIMESTAMP
└── cancelled_at      TIMESTAMP

-- Uso mensual por tenant (para quotas)
usage_records
├── id                UUID PK
├── tenant_id         UUID FK → tenants
├── period            DATE                  -- primer día del mes
├── orders_count      INTEGER DEFAULT 0
├── messages_sent     INTEGER DEFAULT 0
├── ai_calls          INTEGER DEFAULT 0
├── ocr_calls         INTEGER DEFAULT 0
└── storage_bytes     BIGINT DEFAULT 0

-- Usuarios del sistema (super-admins de VSPRO)
super_admins
├── id                UUID PK
├── email             VARCHAR UNIQUE
├── password_hash     VARCHAR
├── role              ENUM(owner, support, billing)
└── created_at        TIMESTAMP
```

---

## Modelo de Datos por Tenant (schema: tenant_xxx)

```sql
-- Usuarios de la PYME
users
├── id                UUID PK
├── email             VARCHAR UNIQUE
├── password_hash     VARCHAR
├── name              VARCHAR
├── role              ENUM(admin, sales, production, accounting, viewer)
├── is_active         BOOLEAN DEFAULT true
└── created_at        TIMESTAMP

-- Canales de mensajería conectados
channels
├── id                UUID PK
├── type              ENUM(whatsapp, messenger, instagram)
├── external_id       VARCHAR               -- Phone number ID / Page ID
├── access_token      TEXT (encrypted)
├── webhook_verify_token  VARCHAR
├── is_active         BOOLEAN
└── config            JSONB

-- Clientes de la PYME
customers
├── id                UUID PK
├── name              VARCHAR
├── phone             VARCHAR
├── email             VARCHAR
├── channel_type      ENUM(whatsapp, messenger, instagram)
├── channel_id        VARCHAR               -- ID en el canal (wa_id, psid, etc.)
├── address           JSONB
├── notes             TEXT
└── created_at        TIMESTAMP

-- Catálogo de productos
products
├── id                UUID PK
├── sku               VARCHAR UNIQUE
├── name              VARCHAR
├── description       TEXT
├── price             DECIMAL
├── category          VARCHAR
├── images            TEXT[]               -- URLs en S3
├── is_active         BOOLEAN DEFAULT true
├── embedding         vector(1536)         -- para búsqueda semántica con pgvector
└── created_at        TIMESTAMP

-- Inventario
inventory
├── id                UUID PK
├── product_id        UUID FK → products
├── stock_available   INTEGER DEFAULT 0
├── stock_reserved    INTEGER DEFAULT 0    -- pedidos confirmados no entregados
├── stock_minimum     INTEGER DEFAULT 5    -- alerta de stock bajo
└── updated_at        TIMESTAMP

-- Pedidos
orders
├── id                UUID PK
├── order_number      VARCHAR UNIQUE        -- "ORD-2024-00001"
├── customer_id       UUID FK → customers
├── channel_type      ENUM(whatsapp, messenger, instagram)
├── status            ENUM(new, quoted, payment_pending, payment_verified,
│                          in_production, ready, shipped, delivered, cancelled)
├── items             JSONB                 -- [{product_id, name, qty, unit_price}]
├── subtotal          DECIMAL
├── shipping_cost     DECIMAL DEFAULT 0
├── total             DECIMAL
├── notes             TEXT
├── shipping_address  JSONB
├── assigned_to       UUID FK → users       -- usuario de producción asignado
└── created_at        TIMESTAMP

-- Pagos
payments
├── id                UUID PK
├── order_id          UUID FK → orders
├── method            ENUM(transfer, stripe, mercadopago, cash)
├── amount            DECIMAL
├── status            ENUM(pending, verified, rejected)
├── reference         VARCHAR               -- número de referencia bancaria
├── proof_image_url   TEXT                  -- URL del comprobante en S3
├── ocr_data          JSONB                 -- datos extraídos por GPT-4o Vision
├── verified_by       UUID FK → users       -- null si fue automático
├── verified_at       TIMESTAMP
└── created_at        TIMESTAMP

-- Conversaciones
conversations
├── id                UUID PK
├── customer_id       UUID FK → customers
├── channel_type      ENUM(whatsapp, messenger, instagram)
├── channel_thread_id VARCHAR               -- ID del hilo en el canal
├── status            ENUM(active, resolved, waiting)
├── context           JSONB                 -- estado de la conversación IA
├── last_message_at   TIMESTAMP
└── created_at        TIMESTAMP

-- Mensajes
messages
├── id                UUID PK
├── conversation_id   UUID FK → conversations
├── direction         ENUM(inbound, outbound)
├── type              ENUM(text, image, audio, document, interactive)
├── content           TEXT
├── media_url         TEXT
├── external_id       VARCHAR               -- ID del mensaje en el canal
├── ai_processed      BOOLEAN DEFAULT false
└── created_at        TIMESTAMP

-- Envíos
shipments
├── id                UUID PK
├── order_id          UUID FK → orders
├── carrier           VARCHAR               -- "FedEx", "DHL", "Estafeta"
├── tracking_number   VARCHAR
├── tracking_url      TEXT
├── status            ENUM(pending, picked_up, in_transit, delivered, failed)
├── estimated_delivery DATE
└── created_at        TIMESTAMP

-- Registro contable
accounting_entries
├── id                UUID PK
├── order_id          UUID FK → orders
├── type              ENUM(sale, refund, adjustment)
├── amount            DECIMAL
├── tax_amount        DECIMAL
├── description       TEXT
├── invoice_id        VARCHAR               -- ID en Facturapi si aplica
└── created_at        TIMESTAMP

-- Configuración de la IA por tenant
ai_config
├── id                UUID PK
├── assistant_name    VARCHAR DEFAULT 'Asistente'
├── tone              ENUM(formal, casual, friendly)
├── welcome_message   TEXT
├── away_message      TEXT                  -- fuera de horario
├── business_hours    JSONB                 -- {mon: {open: "09:00", close: "18:00"}}
├── language          VARCHAR DEFAULT 'es'
└── custom_prompts    JSONB                 -- instrucciones adicionales
```

---

## Middleware de Tenant Resolution

Cada request HTTP debe identificar el tenant antes de ejecutar cualquier lógica.

```typescript
// apps/api/src/common/middleware/tenant.middleware.ts

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Estrategia 1: Subdominio  → tortilleria.vspro.app
    const host = req.hostname; // "tortilleria.vspro.app"
    const subdomain = host.split('.')[0];

    // Estrategia 2: Header (para webhooks de Meta)
    const tenantSlug = req.headers['x-tenant-slug'] as string || subdomain;

    if (!tenantSlug || tenantSlug === 'www' || tenantSlug === 'app') {
      return next(); // rutas públicas / super-admin
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: { plan: true, subscription: true }
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    if (tenant.status === 'suspended') {
      throw new ForbiddenException('Cuenta suspendida por falta de pago');
    }

    // Inyectar tenant en el request para uso en controllers/services
    req['tenant'] = tenant;

    // Cambiar el schema de PostgreSQL para este request
    await this.prisma.$executeRaw`SET search_path TO ${tenant.schemaName}, public`;

    next();
  }
}
```

---

## Creación Automática de Tenant (Onboarding)

```typescript
// apps/api/src/tenants/tenant-provisioning.service.ts

@Injectable()
export class TenantProvisioningService {
  async provisionNewTenant(dto: CreateTenantDto): Promise<Tenant> {
    const schemaName = `tenant_${generateShortId()}`; // ej: tenant_abc123

    return await this.prisma.$transaction(async (tx) => {
      // 1. Crear registro en tabla pública
      const tenant = await tx.tenant.create({
        data: {
          slug: dto.slug,
          schemaName,
          businessName: dto.businessName,
          ownerEmail: dto.email,
          status: 'trial',
          trialEndsAt: addDays(new Date(), 14),
          planId: BASIC_PLAN_ID,
        }
      });

      // 2. Crear schema en PostgreSQL
      await tx.$executeRaw`CREATE SCHEMA IF NOT EXISTS ${schemaName}`;

      // 3. Ejecutar migraciones del schema del tenant
      await this.runTenantMigrations(schemaName);

      // 4. Insertar configuración inicial
      await this.seedTenantDefaults(schemaName, dto);

      // 5. Crear usuario admin inicial
      await this.createOwnerUser(schemaName, dto);

      // 6. Enviar email de bienvenida
      await this.emailService.sendWelcome(dto.email, tenant);

      return tenant;
    });
  }
}
```

---

## Aislamiento de Datos — Regla de Oro

**Ningún service puede acceder a datos de otro tenant.**

Se garantiza mediante:
1. El middleware cambia `search_path` al schema del tenant en cada request
2. Todos los queries usan el Prisma client con el schema correcto
3. Tests automatizados verifican que no hay cross-tenant data leaks
4. Auditoría de accesos en logs con tenant_id en cada entrada
