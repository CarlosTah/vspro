import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../database/prisma.service';
import { PaymentVerificationService, VerificationResult } from './payment-verification.service';
import { ProductionFlowEvent } from '../production/production-flow.processor';
import { InventoryEvent } from '../inventory/inventory-events.processor';

/**
 * Queue Integration: PaymentVerificationService → ProductionFlowProcessor
 *
 * Orchestrates the event chain when a payment is verified:
 * 1. PaymentVerificationService verifies payment (OCR or manual)
 * 2. This service enqueues downstream events:
 *    - production-queue: inject_order (start production)
 *    - inventory-events: payment_verified (commit reserved stock)
 * 3. Processors handle each event independently with tenant isolation
 *
 * Event: payment_verified
 * Flow: Payment Verified → [production-queue, inventory-events] → Production + Stock Commit
 */
@Injectable()
export class PaymentQueueIntegration {
  private readonly logger = new Logger(PaymentQueueIntegration.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentVerification: PaymentVerificationService,
    @InjectQueue('production-queue') private readonly productionQueue: Queue,
    @InjectQueue('inventory-events') private readonly inventoryQueue: Queue,
  ) {}

  /**
   * Full verification + queue dispatch flow.
   * Called when a payment proof image is submitted.
   */
  async verifyAndDispatch(
    imageUrl: string,
    orderId: string,
    tenantId: string,
    schemaName: string,
  ): Promise<VerificationResult> {
    // 1. Verify payment via OCR
    const result = await this.paymentVerification.verifyByImage(imageUrl, orderId, schemaName);

    // 2. If verified, dispatch downstream events
    if (result.verified) {
      await this.dispatchPaymentVerified(orderId, tenantId, schemaName);
    }

    return result;
  }

  /**
   * Dispatch downstream events after payment verification.
   * Called by verifyAndDispatch() or directly after manual verification.
   */
  async dispatchPaymentVerified(
    orderId: string,
    tenantId: string,
    schemaName: string,
  ): Promise<void> {
    // Load order details for downstream processors
    const orders = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.id, o.order_number, o.items, o.customer_id
      FROM "${schemaName}".orders o
      WHERE o.id = $1::uuid
    `, orderId);

    if (!orders[0]) {
      this.logger.error(`[${schemaName}] Order ${orderId} not found for dispatch`);
      return;
    }

    const order = orders[0];
    const orderItems = this.parseOrderItems(order.items);

    // ─── Dispatch to Production Queue ───────────────────────────
    const productionEvent: ProductionFlowEvent = {
      type: 'inject_order',
      tenantId,
      schemaName,
      orderId: order.id,
      orderNumber: order.order_number,
      priority: 'normal',
      items: orderItems.map(item => ({
        productId: item.productId,
        productName: item.productName ?? item.productId,
        quantity: item.quantity,
        variantId: item.variantId,
        variantName: item.variantName,
      })),
    };

    await this.productionQueue.add('inject_order', productionEvent, {
      jobId: `prod-${tenantId}-${orderId}-${Date.now()}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    // ─── Dispatch to Inventory Events Queue ─────────────────────
    const inventoryEvent: InventoryEvent = {
      type: 'payment_verified',
      tenantId,
      schemaName,
      orderId: order.id,
      items: orderItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    };

    await this.inventoryQueue.add('payment_verified', inventoryEvent, {
      jobId: `inv-${tenantId}-${orderId}-${Date.now()}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    this.logger.log(
      `[${schemaName}] payment_verified dispatched for order ${order.order_number}: ` +
      `production-queue + inventory-events (${orderItems.length} items)`,
    );
  }

  /**
   * Hook for manual verification — dispatches the same downstream events.
   * Called after admin manually verifies a payment.
   */
  async onManualVerification(
    paymentId: string,
    tenantId: string,
    schemaName: string,
  ): Promise<void> {
    // Get orderId from payment
    const payments = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT order_id FROM "${schemaName}".payments WHERE id = $1::uuid
    `, paymentId);

    if (!payments[0]) {
      this.logger.error(`[${schemaName}] Payment ${paymentId} not found`);
      return;
    }

    await this.dispatchPaymentVerified(payments[0].order_id, tenantId, schemaName);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private parseOrderItems(items: any): Array<{
    productId: string;
    productName?: string;
    quantity: number;
    variantId?: string;
    variantName?: string;
  }> {
    if (!items) return [];
    if (typeof items === 'string') {
      try { return JSON.parse(items); } catch { return []; }
    }
    if (Array.isArray(items)) return items;
    return [];
  }
}
