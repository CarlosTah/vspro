-- ─────────────────────────────────────────────────────────────
-- Schema del Tenant — Tablas de negocio
-- Se ejecuta una vez por cada tenant al provisionarlo.
-- El parámetro :schema se reemplaza dinámicamente por el schemaName.
-- ─────────────────────────────────────────────────────────────

-- Usuarios de la PYME
CREATE TABLE IF NOT EXISTS "{{schema}}".users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  role          VARCHAR(50) NOT NULL DEFAULT 'admin',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Canales de mensajería conectados
CREATE TABLE IF NOT EXISTS "{{schema}}".channels (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                 VARCHAR(50) NOT NULL,  -- whatsapp | messenger | instagram
  external_id          VARCHAR(255) NOT NULL, -- Phone Number ID / Page ID
  access_token         TEXT NOT NULL,         -- encriptado en aplicación
  webhook_verify_token VARCHAR(255),
  is_active            BOOLEAN NOT NULL DEFAULT true,
  config               JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clientes de la PYME
CREATE TABLE IF NOT EXISTS "{{schema}}".customers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255),
  phone        VARCHAR(50),
  email        VARCHAR(255),
  channel_type VARCHAR(50) NOT NULL,  -- canal por donde llegó
  channel_id   VARCHAR(255) NOT NULL, -- ID en el canal (wa_id, psid, etc.)
  address      JSONB,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel_type, channel_id)
);

-- Catálogo de productos
CREATE TABLE IF NOT EXISTS "{{schema}}".products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         VARCHAR(100) UNIQUE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  price       DECIMAL(10,2) NOT NULL DEFAULT 0,
  category    VARCHAR(100),
  images      TEXT[] DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  embedding       vector(1536),  -- para búsqueda semántica con pgvector
  external_rates  JSONB DEFAULT '{}',  -- tarifas externas (marketplace, delivery apps)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventario
CREATE TABLE IF NOT EXISTS "{{schema}}".inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES "{{schema}}".products(id) ON DELETE CASCADE,
  stock_available INTEGER NOT NULL DEFAULT 0,
  stock_reserved  INTEGER NOT NULL DEFAULT 0,
  stock_minimum   INTEGER NOT NULL DEFAULT 5,
  blocking_dates  JSONB DEFAULT '[]',  -- fechas bloqueadas para este producto
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id)
);

-- Pedidos
CREATE TABLE IF NOT EXISTS "{{schema}}".orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     VARCHAR(50) UNIQUE NOT NULL,
  customer_id      UUID NOT NULL REFERENCES "{{schema}}".customers(id),
  channel_type     VARCHAR(50) NOT NULL,
  status           VARCHAR(50) NOT NULL DEFAULT 'new',
  items            JSONB NOT NULL DEFAULT '[]',
  subtotal         DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping_cost    DECIMAL(10,2) NOT NULL DEFAULT 0,
  total            DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  shipping_address JSONB,
  assigned_to      UUID REFERENCES "{{schema}}".users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pagos
CREATE TABLE IF NOT EXISTS "{{schema}}".payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES "{{schema}}".orders(id),
  method        VARCHAR(50) NOT NULL,  -- transfer | stripe | mercadopago | cash
  amount        DECIMAL(10,2) NOT NULL,
  status        VARCHAR(50) NOT NULL DEFAULT 'pending',
  reference     VARCHAR(255),
  proof_image_url TEXT,
  ocr_data      JSONB,
  verified_by   UUID REFERENCES "{{schema}}".users(id),
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversaciones
CREATE TABLE IF NOT EXISTS "{{schema}}".conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES "{{schema}}".customers(id),
  channel_type      VARCHAR(50) NOT NULL,
  channel_thread_id VARCHAR(255),
  status            VARCHAR(50) NOT NULL DEFAULT 'active',
  context           JSONB NOT NULL DEFAULT '{}',
  agent_context     JSONB NOT NULL DEFAULT '{}',
  last_message_at   TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ DEFAULT NULL,
  last_proactive_at TIMESTAMPTZ DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mensajes
CREATE TABLE IF NOT EXISTS "{{schema}}".messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES "{{schema}}".conversations(id),
  direction       VARCHAR(20) NOT NULL,  -- inbound | outbound
  type            VARCHAR(50) NOT NULL DEFAULT 'text',
  content         TEXT,
  media_url       TEXT,
  external_id     VARCHAR(255),
  ai_processed    BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Envíos
CREATE TABLE IF NOT EXISTS "{{schema}}".shipments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES "{{schema}}".orders(id),
  carrier            VARCHAR(100),
  tracking_number    VARCHAR(255),
  tracking_url       TEXT,
  status             VARCHAR(50) NOT NULL DEFAULT 'pending',
  estimated_delivery DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registro contable
CREATE TABLE IF NOT EXISTS "{{schema}}".accounting_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID REFERENCES "{{schema}}".orders(id),
  type        VARCHAR(50) NOT NULL,  -- sale | refund | adjustment
  amount      DECIMAL(10,2) NOT NULL,
  tax_amount  DECIMAL(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  invoice_id  VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Configuración de IA
CREATE TABLE IF NOT EXISTS "{{schema}}".ai_config (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_name       VARCHAR(100) NOT NULL DEFAULT 'Asistente',
  tone                 VARCHAR(50) NOT NULL DEFAULT 'friendly',
  welcome_message      TEXT,
  away_message         TEXT,
  language             VARCHAR(10) NOT NULL DEFAULT 'es',
  business_hours       JSONB NOT NULL DEFAULT '{}',
  custom_instructions  TEXT,
  custom_tools         JSONB DEFAULT '[]',
  proactive_template   JSONB DEFAULT NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Memoria de cliente (perfil determinístico JSONB)
CREATE TABLE IF NOT EXISTS "{{schema}}".customer_memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "{{schema}}".customers(id) ON DELETE CASCADE,
  profile     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id)
);

-- Memoria episódica conversacional (pgvector)
CREATE TABLE IF NOT EXISTS "{{schema}}".customer_memory_episodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "{{schema}}".customers(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  embedding   vector(1536),
  category    VARCHAR(50) NOT NULL DEFAULT 'general_context',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index para búsqueda semántica eficiente (approximate nearest-neighbor)
CREATE INDEX IF NOT EXISTS idx_customer_memory_episodes_embedding
  ON "{{schema}}".customer_memory_episodes
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Índice para filtrado por cliente en episodios
CREATE INDEX IF NOT EXISTS idx_customer_memory_episodes_customer
  ON "{{schema}}".customer_memory_episodes(customer_id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_orders_customer    ON "{{schema}}".orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status      ON "{{schema}}".orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created     ON "{{schema}}".orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv      ON "{{schema}}".messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_cust ON "{{schema}}".conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_follow_up
  ON "{{schema}}".conversations(next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_channel  ON "{{schema}}".customers(channel_type, channel_id);
CREATE INDEX IF NOT EXISTS idx_products_active    ON "{{schema}}".products(is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock
  ON "{{schema}}".inventory(stock_available, stock_minimum)
  WHERE stock_available < stock_minimum;
CREATE INDEX IF NOT EXISTS idx_payments_order     ON "{{schema}}".payments(order_id);


-- Variantes de producto (combinación libre de atributos)
CREATE TABLE IF NOT EXISTS "{{schema}}".product_variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES "{{schema}}".products(id) ON DELETE CASCADE,
  sku             VARCHAR(100),
  name            VARCHAR(255) NOT NULL,  -- ej: "Talla M - Rojo" o "1kg"
  price           DECIMAL(10,2),          -- null = usa precio del producto padre
  stock_available INTEGER NOT NULL DEFAULT 0,
  stock_reserved  INTEGER NOT NULL DEFAULT 0,
  attributes      JSONB NOT NULL DEFAULT '{}',  -- ej: {"talla": "M", "color": "Rojo"}
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON "{{schema}}".product_variants(product_id);
