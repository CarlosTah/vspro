import { PaymentQueueIntegration } from './payment-queue.integration';

const mockPrisma = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn().mockResolvedValue(1),
} as any;

const mockPaymentVerification = {
  verifyByImage: jest.fn(),
} as any;

const mockProductionQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
} as any;

const mockInventoryQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-2' }),
} as any;

describe('PaymentQueueIntegration', () => {
  let service: PaymentQueueIntegration;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentQueueIntegration(
      mockPrisma,
      mockPaymentVerification,
      mockProductionQueue,
      mockInventoryQueue,
    );
  });

  describe('verifyAndDispatch', () => {
    it('dispatches to both queues when payment is verified', async () => {
      mockPaymentVerification.verifyByImage.mockResolvedValue({
        verified: true,
        reason: 'Amount matches',
        ocrData: { amount: 299, confidence: 0.95 },
      });

      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{
        id: 'order-1',
        order_number: 'ORD-2026-00001',
        items: [{ productId: 'prod-1', productName: 'Vestido', quantity: 2 }],
        customer_id: 'cust-1',
      }]);

      const result = await service.verifyAndDispatch(
        'https://img.test/proof.jpg', 'order-1', 'tenant-1', 'tenant_test',
      );

      expect(result.verified).toBe(true);
      expect(mockProductionQueue.add).toHaveBeenCalledWith(
        'inject_order',
        expect.objectContaining({
          type: 'inject_order',
          tenantId: 'tenant-1',
          schemaName: 'tenant_test',
          orderId: 'order-1',
        }),
        expect.any(Object),
      );
      expect(mockInventoryQueue.add).toHaveBeenCalledWith(
        'payment_verified',
        expect.objectContaining({
          type: 'payment_verified',
          tenantId: 'tenant-1',
          schemaName: 'tenant_test',
          orderId: 'order-1',
        }),
        expect.any(Object),
      );
    });

    it('does NOT dispatch when payment verification fails', async () => {
      mockPaymentVerification.verifyByImage.mockResolvedValue({
        verified: false,
        reason: 'Amount mismatch',
        ocrData: { amount: 100, confidence: 0.8 },
      });

      const result = await service.verifyAndDispatch(
        'https://img.test/proof.jpg', 'order-1', 'tenant-1', 'tenant_test',
      );

      expect(result.verified).toBe(false);
      expect(mockProductionQueue.add).not.toHaveBeenCalled();
      expect(mockInventoryQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('dispatchPaymentVerified', () => {
    it('enqueues production job with correct items', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{
        id: 'order-1',
        order_number: 'ORD-001',
        items: [
          { productId: 'p1', productName: 'Item A', quantity: 1 },
          { productId: 'p2', productName: 'Item B', quantity: 3 },
        ],
        customer_id: 'c1',
      }]);

      await service.dispatchPaymentVerified('order-1', 'tenant-1', 'tenant_test');

      const prodCall = mockProductionQueue.add.mock.calls[0][1];
      expect(prodCall.items).toHaveLength(2);
      expect(prodCall.items[0].productName).toBe('Item A');
      expect(prodCall.items[1].quantity).toBe(3);
    });

    it('enqueues inventory event with product quantities', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{
        id: 'order-1',
        order_number: 'ORD-001',
        items: [{ productId: 'p1', quantity: 5 }],
        customer_id: 'c1',
      }]);

      await service.dispatchPaymentVerified('order-1', 'tenant-1', 'tenant_test');

      const invCall = mockInventoryQueue.add.mock.calls[0][1];
      expect(invCall.items[0].productId).toBe('p1');
      expect(invCall.items[0].quantity).toBe(5);
    });

    it('does nothing if order not found', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

      await service.dispatchPaymentVerified('order-x', 'tenant-1', 'tenant_test');

      expect(mockProductionQueue.add).not.toHaveBeenCalled();
      expect(mockInventoryQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('onManualVerification', () => {
    it('dispatches events after finding orderId from payment', async () => {
      // First call: get order_id from payment
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ order_id: 'order-1' }]);
      // Second call: get order details
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{
        id: 'order-1',
        order_number: 'ORD-001',
        items: [{ productId: 'p1', quantity: 1 }],
        customer_id: 'c1',
      }]);

      await service.onManualVerification('pay-1', 'tenant-1', 'tenant_test');

      expect(mockProductionQueue.add).toHaveBeenCalled();
      expect(mockInventoryQueue.add).toHaveBeenCalled();
    });
  });
});
