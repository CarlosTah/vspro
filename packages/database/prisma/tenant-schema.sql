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


-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: Agendamiento Inteligente (intelligent-scheduling)
-- ═══════════════════════════════════════════════════════════════

-- Configuración de agendamiento por tenant
CREATE TABLE IF NOT EXISTS "{{schema}}".scheduling_config (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_duration_minutes     INTEGER NOT NULL DEFAULT 30,
  min_advance_notice_hours  INTEGER NOT NULL DEFAULT 2,
  max_booking_horizon_days  INTEGER NOT NULL DEFAULT 30,
  cancellation_window_hours INTEGER NOT NULL DEFAULT 2,
  reminder_intervals_hours  JSONB NOT NULL DEFAULT '[24, 1]',
  timezone                  VARCHAR(50) NOT NULL DEFAULT 'America/Mexico_City',
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertar config por defecto
INSERT INTO "{{schema}}".scheduling_config (slot_duration_minutes, min_advance_notice_hours, max_booking_horizon_days, cancellation_window_hours, reminder_intervals_hours, timezone)
VALUES (30, 2, 30, 2, '[24, 1]', 'America/Mexico_City')
ON CONFLICT DO NOTHING;

-- Horarios de staff (disponibilidad semanal recurrente)
CREATE TABLE IF NOT EXISTS "{{schema}}".staff_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    UUID NOT NULL REFERENCES "{{schema}}".users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  break_start TIME,
  break_end   TIME,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  CHECK (end_time > start_time),
  CHECK ((break_start IS NULL AND break_end IS NULL) OR (break_start IS NOT NULL AND break_end IS NOT NULL)),
  UNIQUE(staff_id, day_of_week)
);

-- Citas/Appointments
CREATE TABLE IF NOT EXISTS "{{schema}}".appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES "{{schema}}".customers(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES "{{schema}}".users(id) ON DELETE CASCADE,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  status          VARCHAR(50) NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show', 'late_cancellation')),
  google_event_id VARCHAR(255),
  service_name    VARCHAR(255) NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

-- Índices para appointments
CREATE INDEX IF NOT EXISTS idx_appointments_staff_time
  ON "{{schema}}".appointments(staff_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_appointments_customer
  ON "{{schema}}".appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_active
  ON "{{schema}}".appointments(status)
  WHERE status IN ('scheduled', 'confirmed');

-- Google Calendar subscriptions por staff
CREATE TABLE IF NOT EXISTS "{{schema}}".calendar_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        UUID NOT NULL REFERENCES "{{schema}}".users(id) ON DELETE CASCADE,
  channel_id      VARCHAR(255) NOT NULL UNIQUE,
  resource_id     VARCHAR(255),
  calendar_id     VARCHAR(255) NOT NULL,
  refresh_token   TEXT,  -- encriptado en app
  expires_at      TIMESTAMPTZ,
  status          VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id)
);


-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: Win-Back Automation (retention)
-- ═══════════════════════════════════════════════════════════════

-- Campañas de retención
CREATE TABLE IF NOT EXISTS "{{schema}}".retention_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  target_segment   VARCHAR(100) NOT NULL,
  trigger_threshold JSONB NOT NULL,
  status           VARCHAR(50) NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  schedule_cron    VARCHAR(100),
  message_variants JSONB NOT NULL DEFAULT '[]',
  metrics          JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run         TIMESTAMPTZ
);

-- Force index en target_segment
CREATE INDEX IF NOT EXISTS idx_retention_campaigns_segment
  ON "{{schema}}".retention_campaigns(target_segment);

-- Log de contactos por campaña (para tracking y frequency limiting)
CREATE TABLE IF NOT EXISTS "{{schema}}".campaign_contact_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES "{{schema}}".retention_campaigns(id) ON DELETE CASCADE,
  customer_id    UUID NOT NULL REFERENCES "{{schema}}".customers(id) ON DELETE CASCADE,
  variant_used   VARCHAR(100),
  channel        VARCHAR(50) NOT NULL,
  status         VARCHAR(50) NOT NULL DEFAULT 'sent'
                 CHECK (status IN ('sent', 'opened', 'converted', 'failed')),
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_at      TIMESTAMPTZ,
  converted_at   TIMESTAMPTZ,
  revenue_amount DECIMAL(10,2)
);

-- Índices para campaign_contact_logs
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign
  ON "{{schema}}".campaign_contact_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_customer_sent
  ON "{{schema}}".campaign_contact_logs(customer_id, sent_at DESC);


-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: Human Audit Layer
-- ═══════════════════════════════════════════════════════════════

-- Configuración de reglas de aprobación
CREATE TABLE IF NOT EXISTS "{{schema}}".audit_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_rules JSONB NOT NULL DEFAULT '[]',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertar config por defecto
INSERT INTO "{{schema}}".audit_config (approval_rules)
VALUES ('[
  {"type":"campaign.activate","enabled":true,"requiredRole":"admin","autoExpireHours":48,"escalateAfterHours":24,"escalateTo":"owner"},
  {"type":"campaign.bulk_send","enabled":true,"requiredRole":"admin","autoExpireHours":24,"escalateAfterHours":12,"escalateTo":"admin","conditions":[{"field":"targetCount","operator":"gt","value":50}]},
  {"type":"discount.high_value","enabled":true,"requiredRole":"manager","autoExpireHours":4,"escalateAfterHours":2,"escalateTo":"admin","conditions":[{"field":"discountPercent","operator":"gt","value":20}]},
  {"type":"tenant.deprovision","enabled":true,"requiredRole":"admin","autoExpireHours":72,"escalateAfterHours":48,"escalateTo":"owner"},
  {"type":"schedule.bulk_change","enabled":true,"requiredRole":"admin","autoExpireHours":24,"escalateAfterHours":12,"escalateTo":"admin","conditions":[{"field":"affectedStaff","operator":"gt","value":3}]},
  {"type":"order.bulk_cancel","enabled":true,"requiredRole":"admin","autoExpireHours":12,"escalateAfterHours":6,"escalateTo":"admin","conditions":[{"field":"orderCount","operator":"gt","value":5}]},
  {"type":"staff.role_change","enabled":true,"requiredRole":"admin","autoExpireHours":48,"escalateAfterHours":24,"escalateTo":"owner"}
]')
ON CONFLICT DO NOTHING;

-- Solicitudes de aprobación
CREATE TABLE IF NOT EXISTS "{{schema}}".approval_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                 VARCHAR(100) NOT NULL,
  status               VARCHAR(50) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'escalated')),
  payload              JSONB NOT NULL DEFAULT '{}',
  requested_by         VARCHAR(255),
  approved_by          UUID REFERENCES "{{schema}}".users(id),
  decided_at           TIMESTAMPTZ,
  decision_metadata    JSONB,
  expires_at           TIMESTAMPTZ,
  escalated_to         VARCHAR(50),
  related_entity_id    VARCHAR(255),
  related_entity_type  VARCHAR(100),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status
  ON "{{schema}}".approval_requests(status)
  WHERE status IN ('pending', 'escalated');

-- Audit trail (log inmutable de acciones)
CREATE TABLE IF NOT EXISTS "{{schema}}".audit_trail (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action       VARCHAR(255) NOT NULL,
  module       VARCHAR(100) NOT NULL,
  entity_type  VARCHAR(100) NOT NULL,
  entity_id    VARCHAR(255) NOT NULL,
  user_id      UUID,
  user_name    VARCHAR(255),
  before_state JSONB,
  after_state  JSONB,
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_entity
  ON "{{schema}}".audit_trail(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_user
  ON "{{schema}}".audit_trail(user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_trail_created
  ON "{{schema}}".audit_trail(created_at DESC);


-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: Workflow Orchestrator
-- ═══════════════════════════════════════════════════════════════

-- Instancias de workflow (state machine JSONB)
CREATE TABLE IF NOT EXISTS "{{schema}}".workflow_instances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         VARCHAR(100) NOT NULL,
  status       VARCHAR(50) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  current_step VARCHAR(100) NOT NULL DEFAULT 'init',
  context      JSONB NOT NULL DEFAULT '{}',
  events       JSONB NOT NULL DEFAULT '[]',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_status
  ON "{{schema}}".workflow_instances(status)
  WHERE status IN ('pending', 'running');

-- Eventos de workflow (log para activity feed)
CREATE TABLE IF NOT EXISTS "{{schema}}".workflow_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         VARCHAR(100) NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_created
  ON "{{schema}}".workflow_events(created_at DESC);


-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: Agent Orchestrator (Multi-Agent Supervisor)
-- ═══════════════════════════════════════════════════════════════

-- Sesiones del orquestador multi-agente (JSONB persistence)
CREATE TABLE IF NOT EXISTS "{{schema}}".orchestrator_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES "{{schema}}".users(id),
  status       VARCHAR(50) NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'completed', 'failed')),
  session_data JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_sessions_user
  ON "{{schema}}".orchestrator_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_orchestrator_sessions_updated
  ON "{{schema}}".orchestrator_sessions(updated_at DESC);


-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: Delivery / Repartidores
-- ═══════════════════════════════════════════════════════════════

-- Motorepartidores registrados
CREATE TABLE IF NOT EXISTS "{{schema}}".delivery_drivers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  phone           VARCHAR(50) NOT NULL,
  vehicle_type    VARCHAR(50) NOT NULL DEFAULT 'moto',
  status          VARCHAR(50) NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available', 'busy', 'offline')),
  max_deliveries  INTEGER NOT NULL DEFAULT 3,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_drivers_status
  ON "{{schema}}".delivery_drivers(status)
  WHERE status = 'available';

-- Asignaciones de entrega
CREATE TABLE IF NOT EXISTS "{{schema}}".delivery_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES "{{schema}}".orders(id) ON DELETE CASCADE,
  driver_id    UUID NOT NULL REFERENCES "{{schema}}".delivery_drivers(id) ON DELETE CASCADE,
  status       VARCHAR(50) NOT NULL DEFAULT 'offered'
               CHECK (status IN ('offered', 'accepted', 'picked_up', 'delivered', 'rejected', 'cancelled')),
  offered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at  TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_driver
  ON "{{schema}}".delivery_assignments(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_order
  ON "{{schema}}".delivery_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_active
  ON "{{schema}}".delivery_assignments(status)
  WHERE status IN ('offered', 'accepted', 'picked_up');


-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: Returns & Exchanges
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "{{schema}}".returns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES "{{schema}}".orders(id),
  customer_id       UUID NOT NULL REFERENCES "{{schema}}".customers(id),
  type              VARCHAR(50) NOT NULL CHECK (type IN ('refund', 'exchange', 'store_credit')),
  status            VARCHAR(50) NOT NULL DEFAULT 'requested'
                    CHECK (status IN ('requested', 'approved', 'shipped_back', 'received', 'processed', 'rejected')),
  items             JSONB NOT NULL DEFAULT '[]',
  refund_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
  tracking_number   VARCHAR(255),
  customer_notes    TEXT,
  staff_notes       TEXT,
  return_window_days INTEGER NOT NULL DEFAULT 30,
  received_at       TIMESTAMPTZ,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_returns_order ON "{{schema}}".returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON "{{schema}}".returns(status) WHERE status NOT IN ('processed', 'rejected');


-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: Asset Registry (Vehicles, Pets, Appliances)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "{{schema}}".asset_registry (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "{{schema}}".customers(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL CHECK (type IN ('vehicle', 'pet', 'appliance', 'property', 'other')),
  name        VARCHAR(255) NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_registry_customer ON "{{schema}}".asset_registry(customer_id);


-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: Service Reminders (km/tiempo/recurrente)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "{{schema}}".service_reminders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID NOT NULL REFERENCES "{{schema}}".customers(id) ON DELETE CASCADE,
  asset_id         VARCHAR(255),
  service_name     VARCHAR(255) NOT NULL,
  interval_value   INTEGER NOT NULL,
  interval_unit    VARCHAR(20) NOT NULL CHECK (interval_unit IN ('days', 'weeks', 'months', 'km')),
  next_due_date    DATE NOT NULL,
  last_completed_at TIMESTAMPTZ,
  last_notified_at TIMESTAMPTZ,
  notes            TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_reminders_due
  ON "{{schema}}".service_reminders(next_due_date)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_service_reminders_customer
  ON "{{schema}}".service_reminders(customer_id);


-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: Maintenance Tickets
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "{{schema}}".service_providers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  phone       VARCHAR(50) NOT NULL,
  category    VARCHAR(100) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "{{schema}}".maintenance_tickets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number        VARCHAR(50) UNIQUE NOT NULL,
  customer_id          UUID NOT NULL REFERENCES "{{schema}}".customers(id),
  property_id          VARCHAR(255),
  category             VARCHAR(100) NOT NULL,
  description          TEXT NOT NULL,
  media_urls           JSONB NOT NULL DEFAULT '[]',
  priority             VARCHAR(20) NOT NULL DEFAULT 'medium'
                       CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status               VARCHAR(50) NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'assigned', 'quoted', 'authorized', 'in_progress', 'completed', 'cancelled')),
  assigned_provider_id UUID REFERENCES "{{schema}}".service_providers(id),
  assigned_at          TIMESTAMPTZ,
  quote_amount         DECIMAL(10,2),
  quote_description    TEXT,
  quoted_at            TIMESTAMPTZ,
  authorized_at        TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_status
  ON "{{schema}}".maintenance_tickets(status) WHERE status NOT IN ('completed', 'cancelled');


-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: Product Collections / Lookbooks
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "{{schema}}".product_collections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  description      TEXT,
  product_ids      JSONB NOT NULL DEFAULT '[]',
  discount_percent INTEGER NOT NULL DEFAULT 0,
  image_url        TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ═══════════════════════════════════════════════════════════════
-- MÓDULO: Knowledge Base (FAQ / Documentos para el agente IA)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "{{schema}}".knowledge_base (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(255) NOT NULL,
  content     TEXT NOT NULL,
  category    VARCHAR(100) NOT NULL DEFAULT 'general',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_active
  ON "{{schema}}".knowledge_base(is_active, sort_order)
  WHERE is_active = true;
