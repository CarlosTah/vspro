/**
 * Multi-Agent Router — E2E Tests (Mocked OpenAI)
 *
 * Tests the full routing + agent execution flow with mocked LLM responses.
 * Validates: intent classification, agent selection, tool execution,
 * discount policy enforcement, and tenant isolation.
 */

import { AgentRouterService } from '../modules/ai/agents/agent-router.service';
import { SalesAgent } from '../modules/ai/agents/sales-agent';
import { FinanceAgent } from '../modules/ai/agents/finance-agent';
import { InventoryAgent } from '../modules/ai/agents/inventory-agent';
import { GeneralAgent } from '../modules/ai/agents/general-agent';
import { DEFAULT_AGENT_CONFIG, AgentConfig, AgentContext } from '../modules/ai/agents/types';

// ─── Mock Setup ─────────────────────────────────────────────────

const mockPrisma = {
  tenant: { findMany: jest.fn().mockResolvedValue([]) },
  $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  $executeRawUnsafe: jest.fn().mockResolvedValue(0),
} as any;

const mockConfig = {
  get: jest.fn((key: string, def?: any) => {
    const map: Record<string, any> = {
      OPENAI_API_KEY: 'sk-test-mock',
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6380,
      REDIS_PASSWORD: 'test',
    };
    return map[key] ?? def;
  }),
} as any;

const mockCustomerMemory = {
  handleToolCall: jest.fn().mockResolvedValue(JSON.stringify({ success: true })),
  buildMemoryContext: jest.fn().mockResolvedValue(''),
} as any;

// ─── Tests ──────────────────────────────────────────────────────

describe('AgentRouterService — Heuristic Classification', () => {
  let router: AgentRouterService;

  beforeEach(() => {
    router = new AgentRouterService(mockConfig);
  });

  it('classifies sales keywords with high confidence', () => {
    const result = router.classifyHeuristic('¿Cuánto cuesta el vestido?', {});
    expect(result.agent).toBe('sales');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('classifies "quiero comprar" as sales', () => {
    const result = router.classifyHeuristic('Quiero comprar 2 vestidos', {});
    expect(result.agent).toBe('sales');
  });

  it('classifies finance keywords', () => {
    const result = router.classifyHeuristic('Ya hice la transferencia', {});
    expect(result.agent).toBe('finance');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('classifies support keywords', () => {
    const result = router.classifyHeuristic('Tengo un problema con mi pedido', {});
    expect(result.agent).toBe('support');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('returns general with low confidence for ambiguous messages', () => {
    const result = router.classifyHeuristic('Hola, buenos días', {});
    expect(result.agent).toBe('general');
    expect(result.confidence).toBeLessThan(0.7);
  });

  it('classifies payment_pending order state as sales', () => {
    const result = router.classifyHeuristic('ok', { orderState: 'payment_pending' });
    expect(result.agent).toBe('sales');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('routes to general when confidence < 0.7', async () => {
    const config: AgentConfig = { ...DEFAULT_AGENT_CONFIG };
    const result = await router.route('Hola', { id: 'conv-1' }, config);
    // Without Redis and with ambiguous message, should fall through to LLM
    // Since OpenAI is mocked/unavailable, defaults to general
    expect(result.agent).toBe('general');
  });
});

describe('SalesAgent — Discount Policy Enforcement', () => {
  let agent: SalesAgent;

  beforeEach(() => {
    agent = new SalesAgent(mockPrisma, mockConfig, mockCustomerMemory);
  });

  it('rejects discount exceeding max_discount_percent', async () => {
    const context: AgentContext = {
      conversationId: 'conv-1',
      customerId: 'cust-1',
      conversationHistory: [],
      tenant: { id: 't1', slug: 'test', businessName: 'Test', schemaName: 'tenant_test' },
      agentConfig: { ...DEFAULT_AGENT_CONFIG, commercial_policies: { max_discount_percent: 10, first_purchase_discount: 5, active_promotions: [] } },
      schemaName: 'tenant_test',
      memoryContext: '',
    };

    const result = await agent.executeTool('apply_discount', { orderId: 'order-1', discountPercent: 25, reason: 'test' }, context);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('10%');
  });

  it('applies discount within policy limits', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ total: '500.00' }]);

    const context: AgentContext = {
      conversationId: 'conv-1',
      customerId: 'cust-1',
      conversationHistory: [],
      tenant: { id: 't1', slug: 'test', businessName: 'Test', schemaName: 'tenant_test' },
      agentConfig: { ...DEFAULT_AGENT_CONFIG, commercial_policies: { max_discount_percent: 15, first_purchase_discount: 10, active_promotions: [] } },
      schemaName: 'tenant_test',
      memoryContext: '',
    };

    const result = await agent.executeTool('apply_discount', { orderId: 'order-1', discountPercent: 10, reason: 'primera compra' }, context);
    const parsed = JSON.parse(result);

    expect(parsed.success).toBe(true);
    expect(parsed.newTotal).toBe('450.00');
    expect(parsed.discount).toBe('50.00');
  });
});

describe('FinanceAgent — Reconciliation Tolerance', () => {
  let agent: FinanceAgent;

  beforeEach(() => {
    agent = new FinanceAgent(mockPrisma, mockConfig, mockCustomerMemory);
  });

  it('auto-reconciles within tolerance', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'pay-1', amount: '299.50', status: 'verified', order_number: 'ORD-001' }]);

    const result = await agent.reconcileStripeEvent(
      { amount: 299.00, reference: 'ORD-001', stripeId: 'evt_123' },
      'tenant_test',
      5.0,
    );

    expect(result.status).toBe('auto_reconciled');
    expect(result.discrepancy).toBe(0.5);
  });

  it('escalates when discrepancy exceeds tolerance', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'pay-2', amount: '299.00', status: 'verified', order_number: 'ORD-002' }]);

    const result = await agent.reconcileStripeEvent(
      { amount: 280.00, reference: 'ORD-002', stripeId: 'evt_456' },
      'tenant_test',
      5.0,
    );

    expect(result.status).toBe('escalated');
    expect(result.discrepancy).toBe(19.0);
  });

  it('returns no_match when payment not found', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

    const result = await agent.reconcileStripeEvent(
      { amount: 100, reference: 'ORD-NONE', stripeId: 'evt_789' },
      'tenant_test',
    );

    expect(result.status).toBe('no_match');
  });
});

describe('InventoryAgent — Stock Scanning', () => {
  let agent: InventoryAgent;

  beforeEach(() => {
    agent = new InventoryAgent(mockPrisma, mockConfig, mockCustomerMemory);
  });

  it('generates supplier draft with correct format', () => {
    const items = [
      { id: '1', name: 'Vestido Mariposas', sku: 'VK-001', stockAvailable: 2, stockMinimum: 5, supplierInfo: { supplier_name: 'Textiles MX', supplier_email: 'compras@textiles.mx' } },
      { id: '2', name: 'Chamarra Estrellas', sku: 'VK-002', stockAvailable: 1, stockMinimum: 5, supplierInfo: { supplier_name: 'Textiles MX', supplier_email: 'compras@textiles.mx' } },
    ];

    const draft = agent.generateSupplierDraft(items, 'Vikids');

    expect(draft).toContain('compras@textiles.mx');
    expect(draft).toContain('Vestido Mariposas');
    expect(draft).toContain('VK-001');
    expect(draft).toContain('Vikids');
    expect(draft).toContain('BORRADOR GENERADO POR IA');
  });

  it('scans tenant stock correctly', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
      { id: '1', name: 'Product A', sku: 'SKU-A', supplierInfo: {}, stockAvailable: 2, stockMinimum: 10 },
    ]);

    const items = await agent.scanTenantStock('tenant_test');

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Product A');
    expect(items[0].stockAvailable).toBe(2);
    expect(items[0].stockMinimum).toBe(10);
  });
});

describe('GeneralAgent — Backward Compatibility', () => {
  let agent: GeneralAgent;

  beforeEach(() => {
    agent = new GeneralAgent(mockPrisma, mockConfig, mockCustomerMemory);
  });

  it('has all expected tools', () => {
    const tools = agent.getTools();
    const toolNames = tools.map(t => t.function.name);

    expect(toolNames).toContain('check_product_availability');
    expect(toolNames).toContain('get_order_status');
    expect(toolNames).toContain('create_order');
    expect(toolNames).toContain('update_customer_memory');
    expect(toolNames).toContain('schedule_follow_up');
  });

  it('system prompt mentions the tenant business name', () => {
    const prompt = agent.getSystemPrompt({ businessName: 'Mi Tienda' }, { enabled: true, model: 'gpt-4o' });

    expect(prompt).toContain('Mi Tienda');
    expect(prompt).toContain('español');
  });
});

describe('Tenant Isolation — Agent Context', () => {
  it('SalesAgent uses schemaName from context for all queries', async () => {
    const agent = new SalesAgent(mockPrisma, mockConfig, mockCustomerMemory);
    mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ name: 'Product', price: '100', stock_available: 5 }]);

    const context: AgentContext = {
      conversationId: 'conv-1',
      customerId: 'cust-1',
      conversationHistory: [],
      tenant: { id: 't1', slug: 'tenant-a', businessName: 'A', schemaName: 'tenant_a' },
      agentConfig: DEFAULT_AGENT_CONFIG,
      schemaName: 'tenant_a',
      memoryContext: '',
    };

    await agent.executeTool('check_product_availability', { query: 'test' }, context);

    // Verify the SQL query uses the correct schema
    const sqlCall = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
    expect(sqlCall).toContain('"tenant_a"');
    expect(sqlCall).not.toContain('"tenant_b"');
  });
});
