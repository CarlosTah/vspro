-- Migration: Agent Integration DB
-- Date: 2026-05-21
-- Description: Add agent_context to conversations, index on stock_minimum,
--              supplier_info on products, agent_config on ai_config.
-- Applies to ALL existing tenant schemas.

DO $$
DECLARE
  tenant_record RECORD;
BEGIN
  FOR tenant_record IN
    SELECT schema_name FROM public.tenants WHERE status IN ('ACTIVE', 'TRIAL')
  LOOP
    -- 1. Add agent_context JSONB to conversations
    EXECUTE format(
      'ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS agent_context JSONB NOT NULL DEFAULT ''{}''',
      tenant_record.schema_name
    );

    -- 2. Add supplier_info JSONB to products
    EXECUTE format(
      'ALTER TABLE %I.products ADD COLUMN IF NOT EXISTS supplier_info JSONB DEFAULT ''{}''',
      tenant_record.schema_name
    );

    -- 3. Add agent_config JSONB to ai_config
    EXECUTE format(
      'ALTER TABLE %I.ai_config ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT ''{"router_model":"gpt-4o-mini","agents":{"sales":{"enabled":true,"model":"gpt-4o","temperature":0.4},"inventory":{"enabled":true,"model":"gpt-4o-mini"},"finance":{"enabled":false,"model":"gpt-4o-mini"},"support":{"enabled":true,"model":"gpt-4o","temperature":0.2},"general":{"enabled":true,"model":"gpt-4o","temperature":0.3}},"commercial_policies":{"max_discount_percent":15,"first_purchase_discount":10,"active_promotions":[]}}''',
      tenant_record.schema_name
    );

    -- 4. Create partial index on inventory for low-stock scanning
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON %I.inventory(stock_available, stock_minimum) WHERE stock_available < stock_minimum',
      tenant_record.schema_name
    );

    -- 5. Ensure next_follow_up_at and last_proactive_at exist (idempotent)
    EXECUTE format(
      'ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS next_follow_up_at TIMESTAMPTZ DEFAULT NULL',
      tenant_record.schema_name
    );
    EXECUTE format(
      'ALTER TABLE %I.conversations ADD COLUMN IF NOT EXISTS last_proactive_at TIMESTAMPTZ DEFAULT NULL',
      tenant_record.schema_name
    );

    RAISE NOTICE 'Migrated schema: %', tenant_record.schema_name;
  END LOOP;
END $$;
