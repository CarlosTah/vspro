import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../database/prisma.service';

// ─── Event Types ────────────────────────────────────────────────

export interface InventoryEvent {
  type: 'payment_verified' | 'order_cancelled';
  tenantId: string;
  schemaName: string;
  orderId: string;
  items: Array<{ productId: string; quantity: number }>;
}

/**
 * Processes inventory events transactionally.
 * Ensures stock consistency when payments are verified or orders cancelled.
 *
 * Events:
 * - payment_verified: Confirms reserved stock (no-op if already committed)
 * - order_cancelled: Releases reserved stock back to available
 *
 * All operations are tenant-isolated via schemaName.
 */
@Processor('inventory-events')
export class InventoryEventsProcessor {
  private readonly logger = new Logger(InventoryEventsProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('payment_verified')
  async handlePaymentVerified(job: Job<InventoryEvent>): Promise<void> {
    const { schemaName, orderId, items, tenantId } = job.data;

    // Validate tenant isolation
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.schemaName !== schemaName) {
      this.logger.error(`Tenant isolation violation: ${tenantId} / ${schemaName}`);
      return;
    }

    this.logger.debug(`[${schemaName}] Payment verified for order ${orderId} — committing stock`);

    // Transactional: move stock from reserved to committed (decrease reserved)
    for (const item of items) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".inventory
        SET stock_reserved = GREATEST(stock_reserved - $1, 0),
            updated_at = NOW()
        WHERE product_id = $2::uuid
          AND stock_reserved >= $1
      `, item.quantity, item.productId);
    }

    // Update order status
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".orders
      SET status = 'paid', updated_at = NOW()
      WHERE id = $1::uuid AND status = 'payment_pending'
    `, orderId);

    this.logger.log(`[${schemaName}] Stock committed for order ${orderId} (${items.length} items)`);
  }

  @Process('order_cancelled')
  async handleOrderCancelled(job: Job<InventoryEvent>): Promise<void> {
    const { schemaName, orderId, items, tenantId } = job.data;

    // Validate tenant isolation
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.schemaName !== schemaName) {
      this.logger.error(`Tenant isolation violation: ${tenantId} / ${schemaName}`);
      return;
    }

    this.logger.debug(`[${schemaName}] Order ${orderId} cancelled — releasing reserved stock`);

    // Transactional: release reserved stock back to available
    for (const item of items) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".inventory
        SET stock_available = stock_available + $1,
            stock_reserved = GREATEST(stock_reserved - $1, 0),
            updated_at = NOW()
        WHERE product_id = $2::uuid
      `, item.quantity, item.productId);
    }

    // Update order status
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".orders
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1::uuid AND status != 'cancelled'
    `, orderId);

    this.logger.log(`[${schemaName}] Stock released for cancelled order ${orderId} (${items.length} items)`);
  }
}
