import OpenAI from 'openai';

// ─── Agent Types ────────────────────────────────────────────────

export type AgentType = 'sales' | 'inventory' | 'finance' | 'support' | 'general';

export const AGENT_TYPES: AgentType[] = ['sales', 'inventory', 'finance', 'support', 'general'];

// ─── Agent Context (passed to every agent.process() call) ───────

export interface AgentContext {
  conversationId: string;
  customerId: string | null;
  conversationHistory: OpenAI.Chat.ChatCompletionMessageParam[];
  tenant: { id: string; slug: string; businessName: string; schemaName: string };
  agentConfig: AgentConfig;
  schemaName: string;
  memoryContext: string;
  orderState?: string;
}

// ─── Agent Response ─────────────────────────────────────────────

export interface AgentResponse {
  text: string;
  toolsExecuted?: string[];
  updatedContext?: Record<string, any>;
}

// ─── Router Result ──────────────────────────────────────────────

export interface RouteResult {
  agent: AgentType;
  confidence: number;
  source: 'cache' | 'heuristic' | 'llm';
}

// ─── Tenant Agent Configuration (stored in ai_config.agent_config) ──

export interface AgentConfig {
  router_model: string;
  agents: Record<AgentType, AgentSettings>;
  commercial_policies: CommercialPolicies;
}

export interface AgentSettings {
  enabled: boolean;
  model: string;
  temperature?: number;
  cron?: string;
}

export interface CommercialPolicies {
  max_discount_percent: number;
  first_purchase_discount: number;
  active_promotions: Promotion[];
}

export interface Promotion {
  name: string;
  discount_percent: number;
  valid_until: string;
  conditions?: string;
}

// ─── Supplier Info (stored in products.supplier_info) ───────────

export interface SupplierInfo {
  supplier_name?: string;
  supplier_email?: string;
  supplier_phone?: string;
  lead_time_days?: number;
  minimum_order_quantity?: number;
}

// ─── Finance Reconciliation ─────────────────────────────────────

export interface ReconciliationResult {
  status: 'auto_reconciled' | 'escalated' | 'no_match';
  discrepancy?: number;
  note?: string;
  paymentId?: string;
  stripeEventId?: string;
}

// ─── Low Stock Item (InventoryAgent) ────────────────────────────

export interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  stockAvailable: number;
  stockMinimum: number;
  supplierInfo: SupplierInfo;
}

// ─── Default Agent Config ───────────────────────────────────────

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  router_model: 'gpt-4o-mini',
  agents: {
    sales: { enabled: true, model: 'gpt-4o', temperature: 0.4 },
    inventory: { enabled: true, model: 'gpt-4o-mini', cron: '0 */6 * * *' },
    finance: { enabled: false, model: 'gpt-4o-mini' },
    support: { enabled: true, model: 'gpt-4o', temperature: 0.2 },
    general: { enabled: true, model: 'gpt-4o', temperature: 0.3 },
  },
  commercial_policies: {
    max_discount_percent: 15,
    first_purchase_discount: 10,
    active_promotions: [],
  },
};
