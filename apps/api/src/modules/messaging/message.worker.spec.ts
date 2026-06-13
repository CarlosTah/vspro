import { MessageWorker } from './message.worker';

// ─── Mocks ──────────────────────────────────────────────────────

const mockPrisma = {
  tenant: { findUnique: jest.fn() },
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn().mockResolvedValue(1),
} as any;

const mockRouter = {
  route: jest.fn().mockResolvedValue({ agent: 'general', confidence: 0.8, source: 'heuristic' }),
} as any;

const mockCustomerMemory = {
  buildMemoryContext: jest.fn().mockResolvedValue(''),
} as any;

const mockMessagingFactory = {
  sendText: jest.fn().mockResolvedValue({ success: true, messageId: 'wamid-123' }),
} as any;

const mockSalesAgent = { process: jest.fn().mockResolvedValue({ text: 'Sales response' }) } as any;
const mockFinanceAgent = { process: jest.fn().mockResolvedValue({ text: 'Finance response' }) } as any;
const mockGeneralAgent = { process: jest.fn().mockResolvedValue({ text: 'General response', toolsExecuted: [] }) } as any;

// ─── Test Data ──────────────────────────────────────────────────

const baseJob = {
  data: {
    tenantId: 'tenant-1',
    schemaName: 'tenant_test',
    conversationId: 'conv-1',
    customerId: 'cust-1',
    messageText: 'Hola, quiero comprar un vestido',
    messageType: 'text',
    channelType: 'whatsapp',
    tenant: { id: 'tenant-1', slug: 'test', businessName: 'Test Shop', schemaName: 'tenant_test' },
  },
} as any;

// ─── Tests ──────────────────────────────────────────────────────

describe('MessageWorker', () => {
  let worker: MessageWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    worker = new MessageWorker(
      mockPrisma,
      mockRouter,
      mockCustomerMemory,
      mockMessagingFactory,
      mockSalesAgent,
      mockFinanceAgent,
      mockGeneralAgent,
    );

    // Default: tenant exists and is active
    mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: 'tenant_test', status: 'ACTIVE' });
    // Default: agent config
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ agentConfig: null }]);
  });

  describe('Tenant Isolation', () => {
    it('rejects if tenant schema does not match', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: 'tenant_other', status: 'ACTIVE' });

      await worker.handleMessage(baseJob);

      expect(mockRouter.route).not.toHaveBeenCalled();
      expect(mockMessagingFactory.sendText).not.toHaveBeenCalled();
    });

    it('rejects if tenant is SUSPENDED', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: 'tenant_test', status: 'SUSPENDED' });

      await worker.handleMessage(baseJob);

      expect(mockRouter.route).not.toHaveBeenCalled();
    });

    it('rejects if tenant is CANCELLED', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: 'tenant_test', status: 'CANCELLED' });

      await worker.handleMessage(baseJob);

      expect(mockRouter.route).not.toHaveBeenCalled();
    });

    it('rejects if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await worker.handleMessage(baseJob);

      expect(mockRouter.route).not.toHaveBeenCalled();
    });
  });

  describe('Agent Routing', () => {
    beforeEach(() => {
      // Mock conversation history + context
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ agentConfig: null }]) // loadAgentConfig
        .mockResolvedValueOnce([]) // getConversationHistory
        .mockResolvedValueOnce([{ context: {}, agentContext: {} }]) // getConversationContext
        .mockResolvedValueOnce([{ channel_id: '5215500001234' }]); // getCustomerChannelId
    });

    it('routes to GeneralAgent by default', async () => {
      mockRouter.route.mockResolvedValue({ agent: 'general', confidence: 0.5, source: 'heuristic' });

      await worker.handleMessage(baseJob);

      expect(mockGeneralAgent.process).toHaveBeenCalled();
      expect(mockSalesAgent.process).not.toHaveBeenCalled();
    });

    it('routes to SalesAgent for sales intent', async () => {
      mockRouter.route.mockResolvedValue({ agent: 'sales', confidence: 0.85, source: 'heuristic' });

      await worker.handleMessage(baseJob);

      expect(mockSalesAgent.process).toHaveBeenCalled();
    });

    it('routes to FinanceAgent for finance intent', async () => {
      mockRouter.route.mockResolvedValue({ agent: 'finance', confidence: 0.8, source: 'heuristic' });

      await worker.handleMessage(baseJob);

      expect(mockFinanceAgent.process).toHaveBeenCalled();
    });
  });

  describe('Outbound Delivery via MessagingFactory', () => {
    beforeEach(() => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ agentConfig: null }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ context: {}, agentContext: {} }])
        .mockResolvedValueOnce([{ channel_id: '5215500001234' }]);
    });

    it('sends response via MessagingFactory.sendText', async () => {
      mockRouter.route.mockResolvedValue({ agent: 'general', confidence: 0.5, source: 'heuristic' });

      await worker.handleMessage(baseJob);

      expect(mockMessagingFactory.sendText).toHaveBeenCalledWith(
        '5215500001234',
        expect.any(String),
        'whatsapp',
        'tenant_test',
      );
    });

    it('stores outbound message in DB before sending', async () => {
      mockRouter.route.mockResolvedValue({ agent: 'general', confidence: 0.5, source: 'heuristic' });

      await worker.handleMessage(baseJob);

      const insertCall = mockPrisma.$executeRawUnsafe.mock.calls.find(
        (c: any[]) => c[0].includes('INSERT INTO') && c[0].includes('messages'),
      );
      expect(insertCall).toBeDefined();
      expect(insertCall[2]).toBe('General response');
    });

    it('does not crash if MessagingFactory fails', async () => {
      mockMessagingFactory.sendText.mockResolvedValue({ success: false, error: 'Network error' });

      // Should not throw
      await expect(worker.handleMessage(baseJob)).resolves.not.toThrow();
    });

    it('skips send if customer has no channel_id', async () => {
      mockPrisma.$queryRawUnsafe
        .mockReset()
        .mockResolvedValueOnce([{ agentConfig: null }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ context: {}, agentContext: {} }])
        .mockResolvedValueOnce([]); // No customer channel_id

      await worker.handleMessage(baseJob);

      expect(mockMessagingFactory.sendText).not.toHaveBeenCalled();
    });
  });

  describe('Memory Context', () => {
    beforeEach(() => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ agentConfig: null }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ context: {}, agentContext: {} }])
        .mockResolvedValueOnce([{ channel_id: '5215500001234' }]);
    });

    it('builds memory context for identified customers', async () => {
      await worker.handleMessage(baseJob);

      expect(mockCustomerMemory.buildMemoryContext).toHaveBeenCalledWith(
        'cust-1',
        'Hola, quiero comprar un vestido',
        'tenant_test',
      );
    });

    it('skips memory context if customerId is null', async () => {
      const jobNoCustomer = { data: { ...baseJob.data, customerId: null } } as any;

      await worker.handleMessage(jobNoCustomer);

      expect(mockCustomerMemory.buildMemoryContext).not.toHaveBeenCalled();
    });
  });

  describe('Agent Context Persistence', () => {
    beforeEach(() => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ agentConfig: null }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ context: {}, agentContext: {} }])
        .mockResolvedValueOnce([{ channel_id: '5215500001234' }]);
    });

    it('saves agent routing context after processing', async () => {
      mockRouter.route.mockResolvedValue({ agent: 'sales', confidence: 0.9, source: 'heuristic' });
      mockSalesAgent.process.mockResolvedValue({ text: 'OK', toolsExecuted: ['create_order'] });

      await worker.handleMessage(baseJob);

      const contextCall = mockPrisma.$executeRawUnsafe.mock.calls.find(
        (c: any[]) => c[0].includes('agent_context'),
      );
      expect(contextCall).toBeDefined();
      const savedContext = JSON.parse(contextCall[1]);
      expect(savedContext.lastAgent).toBe('sales');
      expect(savedContext.lastConfidence).toBe(0.9);
      expect(savedContext.toolsExecuted).toContain('create_order');
    });
  });
});
