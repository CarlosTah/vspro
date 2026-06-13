import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../database/prisma.service';

interface InventoryEvent {
  type: 'payment_verified' | 'order_cancelled';
  tenantId: string;
  schemaName: string;
  orderId: string;
  items: Array<{ productId: string; quantity: number }>;
}

@Processor('inventory-events')
export class InventoryEventsProcessor {
  private readonly logger = new Logger(InventoryEventsProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('payment_verified')
  async handlePaymentVerified(job: Job<InventoryEvent>): Promise<void> {
    const { tenantId, schemaName, orderId, items } = job.data;

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.schemaName !== schemaName) return;

    for (const item of items) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".inventory
        SET stock_reserved = GREATEST(stock_reserved - $1, 0), updated_at = NOW()
        WHERE product_id = $2::uuid
      `, item.quantity, item.productId);
    }

    this.logger.log(`[${schemaName}] Stock committed for order ${orderId}`);
  }

  @Process('order_cancelled')
  async handleOrderCancelled(job: Job<InventoryEvent>): Promise<void> {
    const { tenantId, schemaName, orderId, items } = job.data;

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.schemaName !== schemaName) return;

    for (const item of items) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".inventory
        SET stock_available = stock_available + $1,
            stock_reserved = GREATEST(stock_reserved - $1, 0),
            updated_at = NOW()
        WHERE product_id = $2::uuid
      `, item.quantity, item.productId);
    }

    this.logger.log(`[${schemaName}] Stock released for cancelled order ${orderId}`);
  }
}
