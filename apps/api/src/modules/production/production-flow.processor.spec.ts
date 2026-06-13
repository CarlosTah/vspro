import { ProductionFlowProcessor, ProductionFlowEvent } from './production-flow.processor';

const mockPrisma = {
  tenant: { findUnique: jest.fn() },
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn().mockResolvedValue(1),
} as any;

describe('ProductionFlowProcessor', () => {
  let processor: ProductionFlowProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new ProductionFlowProcessor(mockPrisma);
    mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: 'tenant_test', status: 'ACTIVE' });
  });

  const baseEvent: ProductionFlowEvent = {
    type: 'inject_order',
    tenantId: 't1',
    schemaName: 'tenant_test',
    orderId: 'order-1',
    orderNumber: 'ORD-2026-00001',
    priority: 'normal',
    items: [
      { productId: 'prod-1', productName: 'Vestido Mariposas', quantity: 2, variantName: 'Talla 6 - Rosa' },
      { productId: 'prod-2', productName: 'Chamarra Estrellas', quantity: 1 },
    ],
  };

  describe('inject_order', () => {
    it('transitions order to in_production', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'order-1', status: 'paid' }]);

      await processor.handleInjectOrder({ data: baseEvent } as any);

      const updateCall = mockPrisma.$executeRawUnsafe.mock.calls[0];
      expect(updateCall[0]).toContain("status = 'in_production'");
      expect(updateCall[2]).toBe('order-1');
    });

    it('creates production log entries for each item', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'order-1', status: 'paid' }]);

      await processor.handleInjectOrder({ data: baseEvent } as any);

      // 1 order update + 2 item logs = 3 execute calls
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);

      const itemLog = mockPrisma.$executeRawUnsafe.mock.calls[1][0];
      expect(itemLog).toContain('Vestido Mariposas');
      expect(itemLog).toContain('Talla 6 - Rosa');
    });

    it('skips if order is not in paid state', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'order-1', status: 'new' }]);

      await processor.handleInjectOrder({ data: baseEvent } as any);

      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('rejects if tenant schema mismatch', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: 'tenant_other', status: 'ACTIVE' });

      await processor.handleInjectOrder({ data: baseEvent } as any);

      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('rejects if tenant is suspended', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ schemaName: 'tenant_test', status: 'SUSPENDED' });

      await processor.handleInjectOrder({ data: baseEvent } as any);

      expect(mockPrisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('handles urgent priority with note', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'order-1', status: 'paid' }]);

      const urgentEvent = { ...baseEvent, priority: 'urgent' as const, notes: 'Cliente VIP' };
      await processor.handleInjectOrder({ data: urgentEvent } as any);

      const updateCall = mockPrisma.$executeRawUnsafe.mock.calls[0][1];
      expect(updateCall).toContain('URGENTE');
    });

    it('skips if order not found', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

      await processor.handleInjectOrder({ data: baseEvent } as any);

      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });
  });
});
