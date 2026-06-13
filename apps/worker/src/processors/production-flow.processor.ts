import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../database/prisma.service';

interface ProductionJob {
  tenantId: string;
  schemaName: string;
  orderId: string;
  orderNumber: string;
  items: Array<{ productId: string; productName: string; quantity: number }>;
  priority: 'normal' | 'urgent';
}

@Processor('production-queue')
export class ProductionFlowProcessor {
  private readonly logger = new Logger(ProductionFlowProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('inject_order')
  async handle(job: Job<ProductionJob>): Promise<void> {
    const { tenantId, schemaName, orderId, orderNumber, items, priority } = job.data;

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || tenant.schemaName !== schemaName) {
      this.logger.error(`Tenant isolation violation: ${tenantId}`);
      return;
    }

    const orders = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT status FROM "${schemaName}".orders WHERE id = $1::uuid`, orderId,
    );

    if (!orders[0] || (orders[0].status !== 'paid' && orders[0].status !== 'ready_for_production')) {
      this.logger.warn(`Order ${orderNumber} not in valid state for production: ${orders[0]?.status}`);
      return;
    }

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".orders
      SET status = 'in_production', updated_at = NOW(),
          notes = COALESCE(notes,'') || $1
      WHERE id = $2::uuid
    `, `\n[Producción: ${new Date().toISOString()}${priority === 'urgent' ? ' URGENTE' : ''}]`, orderId);

    this.logger.log(`[${schemaName}] Order ${orderNumber} → in_production (${items.length} items)`);
  }
}
