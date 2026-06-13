import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../database/prisma.service';

// ─── Event Types ────────────────────────────────────────────────

export interface ProductionFlowEvent {
  type: 'inject_order';
  tenantId: string;
  schemaName: string;
  orderId: string;
  orderNumber: string;
  items: ProductionItem[];
  priority: 'normal' | 'urgent';
  notes?: string;
}

export interface ProductionItem {
  productId: string;
  productName: string;
  quantity: number;
  variantId?: string;
  variantName?: string;
  attributes?: Record<string, string>; // e.g., { talla: "6", color: "Rosa" }
}

/**
 * Production Flow Processor — handles automatic injection of orders
 * into the production queue when payment is verified.
 *
 * Queue: production-queue
 * Events:
 * - inject_order: Creates production entries for each item in the order,
 *   transitions order to 'in_production' state, and logs the injection.
 *
 * Tenant isolation enforced via schemaName validation.
 */
@Processor('production-queue')
export class ProductionFlowProcessor {
  private readonly logger = new Logger(ProductionFlowProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('inject_order')
  async handleInjectOrder(job: Job<ProductionFlowEvent>): Promise<void> {
    const { tenantId, schemaName, orderId, orderNumber, items, priority, notes } = job.data;

    // 1. Validate tenant isolation
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { schemaName: true, status: true },
    });

    if (!tenant || tenant.schemaName !== schemaName) {
      this.logger.error(`Tenant isolation violation in ProductionFlow: ${tenantId} / ${schemaName}`);
      return;
    }

    if (tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
      this.logger.warn(`Tenant ${tenantId} is ${tenant.status}, skipping production injection`);
      return;
    }

    // 2. Verify order exists and is in correct state
    const orders = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, status FROM "${schemaName}".orders WHERE id = $1::uuid
    `, orderId);

    if (!orders[0]) {
      this.logger.error(`[${schemaName}] Order ${orderId} not found`);
      return;
    }

    if (orders[0].status !== 'paid' && orders[0].status !== 'ready_for_production') {
      this.logger.warn(
        `[${schemaName}] Order ${orderNumber} in state '${orders[0].status}' — expected 'paid'. Skipping.`,
      );
      return;
    }

    this.logger.log(`[${schemaName}] Injecting order ${orderNumber} into production (${items.length} items, priority: ${priority})`);

    // 3. Transition order to in_production
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".orders
      SET status = 'in_production',
          notes = COALESCE(notes, '') || $1,
          updated_at = NOW()
      WHERE id = $2::uuid
    `, `\n[Producción iniciada: ${new Date().toISOString()}${priority === 'urgent' ? ' — URGENTE' : ''}]`, orderId);

    // 4. Create production entries for tracking
    for (const item of items) {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".messages
          (conversation_id, direction, type, content, ai_processed)
        SELECT c.id, 'system', 'production_log', $1, false
        FROM "${schemaName}".conversations c
        JOIN "${schemaName}".orders o ON o.customer_id = c.customer_id
        WHERE o.id = $2::uuid
        LIMIT 1
      `, `[PRODUCCIÓN] ${item.productName}${item.variantName ? ` (${item.variantName})` : ''} x${item.quantity}${notes ? ` — ${notes}` : ''}`, orderId);
    }

    this.logger.log(`[${schemaName}] Order ${orderNumber} injected into production successfully`);
  }
}
