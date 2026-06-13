import { PaymentVerificationService } from './payment-verification.service';

const mockPrisma = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn().mockResolvedValue(1),
} as any;

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'OPENAI_API_KEY') return 'sk-test-mock';
    return undefined;
  }),
} as any;

describe('PaymentVerificationService', () => {
  let service: PaymentVerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentVerificationService(mockPrisma, mockConfig);
  });

  describe('verifyByImage', () => {
    it('returns not verified when no pending payment found', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

      const result = await service.verifyByImage('https://img.test/proof.jpg', 'order-1', 'tenant_test');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('No pending payment');
    });

    it('returns not verified when OCR fails (no OpenAI key)', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([
        { id: 'pay-1', amount: '299.00', status: 'pending', order_number: 'ORD-001', total: '299.00' },
      ]);

      // Service has sk-test key so openai is null
      const result = await service.verifyByImage('https://img.test/proof.jpg', 'order-1', 'tenant_test');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('OCR failed');
    });
  });

  describe('extractFromImage', () => {
    it('returns null when OpenAI is not configured', async () => {
      const result = await service.extractFromImage('https://img.test/proof.jpg');
      expect(result).toBeNull();
    });
  });

  describe('verifyManual', () => {
    it('updates payment status to verified', async () => {
      await service.verifyManual('pay-1', 'user-1', 'tenant_test');

      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("status = 'verified'"),
        'user-1',
        'pay-1',
      );
    });
  });

  describe('reject', () => {
    it('updates payment status to rejected with reason', async () => {
      await service.reject('pay-1', 'Comprobante falso', 'user-1', 'tenant_test');

      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("status = 'rejected'"),
        'user-1',
        expect.stringContaining('Comprobante falso'),
        'pay-1',
      );
    });
  });
});
