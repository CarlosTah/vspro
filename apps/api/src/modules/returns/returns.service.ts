import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export type ReturnType = 'refund' | 'exchange' | 'store_credit';
export type ReturnStatus = 'requested' | 'approved' | 'shipped_back' | 'received' | 'processed' | 'rejected';

export interface CreateReturnDto {
  orderId: string;
  items: Array<{ productName: string; quantity: number; reason: string; exchangeVariant?: string }>;
  type: ReturnType;
  customerNotes?: string;
}

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateReturnDto, customerId: string, schemaName: string) {
    // Validate order belongs to customer
    const orders = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, order_number, status, items, total, created_at
      FROM "${schemaName}".orders WHERE id = $1::uuid AND customer_id = $2::uuid
    `, dto.orderId, customerId);

    if (!orders[0]) throw new NotFoundException('Pedido no encontrado');

    const order = orders[0];
    const daysSinceOrder = (Date.now() - new Date(order.created_at).getTime()) / 86400000;

    // Check return window (default 30 days)
    if (daysSinceOrder > 30) {
      throw new BadRequestException('El período de devolución (30 días) ha expirado');
    }

    // Check order was delivered
    if (!['delivered', 'shipped'].includes(order.status)) {
      throw new BadRequestException(`Solo se pueden devolver pedidos entregados. Status actual: ${order.status}`);
    }

    // If exchange, check stock
    if (dto.type === 'exchange') {
      for (const item of dto.items) {
        if (item.exchangeVariant) {
          const stock = await this.prisma.$queryRawUnsafe<any[]>(`
            SELECT pv.stock_available FROM "${schemaName}".product_variants pv
            WHERE pv.name ILIKE $1 AND pv.stock_available >= $2
          `, `%${item.exchangeVariant}%`, item.quantity);

          if (!stock[0]) {
            throw new BadRequestException(`No hay stock de "${item.exchangeVariant}" para el cambio`);
          }
        }
      }
    }

    // Calculate refund amount
    const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    let refundAmount = 0;
    for (const returnItem of dto.items) {
      const matched = orderItems.find((oi: any) => oi.productName?.toLowerCase().includes(returnItem.productName.toLowerCase()));
      if (matched) {
        refundAmount += (matched.unitPrice ?? 0) * returnItem.quantity;
      }
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".returns
        (order_id, customer_id, type, status, items, refund_amount, customer_notes, return_window_days)
      VALUES ($1::uuid, $2::uuid, $3, 'requested', $4::jsonb, $5, $6, 30)
      RETURNING id, type, status, refund_amount AS "refundAmount", created_at AS "createdAt"
    `, dto.orderId, customerId, dto.type, JSON.stringify(dto.items), refundAmount, dto.customerNotes ?? null);

    this.logger.log(`[${schemaName}] Return created: ${rows[0].id} (${dto.type}) $${refundAmount}`);
    return { ...rows[0], orderNumber: order.order_number, items: dto.items };
  }

  async approve(returnId: string, schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".returns SET status = 'approved', updated_at = NOW() WHERE id = $1::uuid AND status = 'requested'
    `, returnId);
    return this.findById(returnId, schemaName);
  }

  async reject(returnId: string, reason: string, schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".returns SET status = 'rejected', staff_notes = $1, updated_at = NOW() WHERE id = $2::uuid
    `, reason, returnId);
    return this.findById(returnId, schemaName);
  }

  async markShippedBack(returnId: string, trackingNumber: string, schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".returns SET status = 'shipped_back', tracking_number = $1, updated_at = NOW() WHERE id = $2::uuid
    `, trackingNumber, returnId);
    return this.findById(returnId, schemaName);
  }

  async markReceived(returnId: string, schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".returns SET status = 'received', received_at = NOW(), updated_at = NOW() WHERE id = $1::uuid
    `, returnId);
    return this.findById(returnId, schemaName);
  }

  async process(returnId: string, schemaName: string) {
    const ret = await this.findById(returnId, schemaName);
    if (ret.status !== 'received') throw new BadRequestException('La devolución debe estar recibida para procesar');

    // Restore stock
    const items = typeof ret.items === 'string' ? JSON.parse(ret.items) : ret.items;
    for (const item of items) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".inventory SET stock_available = stock_available + $1, updated_at = NOW()
        WHERE product_id = (SELECT id FROM "${schemaName}".products WHERE name ILIKE $2 LIMIT 1)
      `, item.quantity, `%${item.productName}%`);
    }

    // Create accounting entry for refund
    if (ret.type === 'refund' || ret.type === 'store_credit') {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".accounting_entries (order_id, type, amount, description)
        VALUES ($1::uuid, 'refund', $2, $3)
      `, ret.orderId, ret.refundAmount, `Devolución ${ret.id}`);
    }

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".returns SET status = 'processed', processed_at = NOW(), updated_at = NOW() WHERE id = $1::uuid
    `, returnId);

    this.logger.log(`[${schemaName}] Return processed: ${returnId} ($${ret.refundAmount})`);
    return this.findById(returnId, schemaName);
  }

  async findAll(schemaName: string, status?: ReturnStatus) {
    const where = status ? `WHERE r.status = $1` : '';
    const params = status ? [status] : [];
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT r.id, r.type, r.status, r.items, r.refund_amount AS "refundAmount",
             r.created_at AS "createdAt", o.order_number AS "orderNumber", c.name AS "customerName"
      FROM "${schemaName}".returns r
      JOIN "${schemaName}".orders o ON o.id = r.order_id
      JOIN "${schemaName}".customers c ON c.id = r.customer_id
      ${where} ORDER BY r.created_at DESC
    `, ...params);
  }

  async findById(returnId: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT r.*, o.order_number AS "orderNumber", c.name AS "customerName"
      FROM "${schemaName}".returns r
      JOIN "${schemaName}".orders o ON o.id = r.order_id
      JOIN "${schemaName}".customers c ON c.id = r.customer_id
      WHERE r.id = $1::uuid
    `, returnId);
    if (!rows[0]) throw new NotFoundException('Devolución no encontrada');
    return rows[0];
  }
}
