import { InventoryEventsProcessor, InventoryEvent } from './inventory-events.processor';

const mockPrisma = {
  tenant: { findUnique: jest.fn() },
  $executeRawUnsafe: jest.fn().mockResolvedValue(1),
} as any;

describe('InventoryEventsProcessor', () => {
  let processor: InventoryEventsProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new InventoryEventsProcessor(mockPrisma);
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't1', schemaName: 'tenant_test' });
  });

  describe('payment_verified', () => {
    const baseEvent: InventoryEvent = {
      type: 'payment_verified',
      tenantId: 't1',
      schemaName: 'tenant_test',
      orderId: 'order-1',
      items: [
        { productId: 'prod-1', quantity: 2 },
        { productId: 'prod-2', quantity: 1 },
      ],
    };

    it('decreases stock_reserved for each item', async () => {
      await processor.handlePaymentVerified({ data: baseEvent } as any);

      // 2 items + 1 order update = 3 calls
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);

      // First item: decrease reserved by 2
      const firstCall = mockPrisma.$executeRawUnsafe.mock.calls[0];
      expect(firstCall[0]).toContain('stock_reserved = GREATEST(stock_reserved -');
      expect(firstCall[1]).toBe(2);
      expect(firstCall[2]).toBe('prod-1');
    });

    it('updates order status to paid', async () => {
      await processor.handlePaymentVerified({ data: baseEvent } as any);

      const lastCall = mockPrisma.$executeRawUnsafe.mock.calls[2];
      expect(lastCall[0]).toContain("status = 'paid'");
      expect(lastCall[1]).toBe('order-1');
    });

    it('rejects if tenant schema mismatch', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 't1', schemaName: 'tenant_other' });

      await processor.handlePaymentVerified({ data: baseEvent } as any);

      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('order_cancelled', () => {
    const baseEvent: InventoryEvent = {
      type: 'order_cancelled',
      tenantId: 't1',
      schemaName: 'tenant_test',
      orderId: 'order-2',
      items: [{ productId: 'prod-1', quantity: 3 }],
    };

    it('releases reserved stock back to available', async () => {
      await processor.handleOrderCancelled({ data: baseEvent } as any);

      const firstCall = mockPrisma.$executeRawUnsafe.mock.calls[0];
      expect(firstCall[0]).toContain('stock_available = stock_available +');
      expect(firstCall[0]).toContain('stock_reserved = GREATEST(stock_reserved -');
      expect(firstCall[1]).toBe(3);
      expect(firstCall[2]).toBe('prod-1');
    });

    it('updates order status to cancelled', async () => {
      await processor.handleOrderCancelled({ data: baseEvent } as any);

      const lastCall = mockPrisma.$executeRawUnsafe.mock.calls[1];
      expect(lastCall[0]).toContain("status = 'cancelled'");
      expect(lastCall[1]).toBe('order-2');
    });

    it('rejects if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await processor.handleOrderCancelled({ data: baseEvent } as any);

      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });
  });
});
