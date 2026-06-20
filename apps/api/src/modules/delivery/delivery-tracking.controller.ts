import { Controller, Get, Post, Param, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';

/**
 * Public tracking controller — no auth required.
 * Used by external delivery drivers to view order details and confirm pickup/delivery.
 * Token is a short hash generated at dispatch time to prevent guessing.
 */
@ApiTags('tracking')
@Controller('track')
export class DeliveryTrackingController {
  constructor(private readonly prisma: PrismaService) {}

  /** Get order tracking info (public, no auth) */
  @Get(':orderId/:token')
  async getTracking(@Param('orderId') orderId: string, @Param('token') token: string) {
    // Find assignment by order + token
    const assignments = await this.findAssignment(orderId, token);
    if (!assignments) throw new NotFoundException('Enlace de seguimiento no válido o expirado');

    const a = assignments;
    return {
      orderNumber: a.orderNumber,
      status: a.status,
      customerName: a.customerName,
      address: a.address,
      total: a.total,
      items: a.items,
      driverName: a.driverName,
      offeredAt: a.offeredAt,
      acceptedAt: a.acceptedAt,
      pickedUpAt: a.pickedUpAt,
      deliveredAt: a.deliveredAt,
      canAccept: a.status === 'offered',
      canPickup: a.status === 'accepted',
      canDeliver: a.status === 'picked_up',
    };
  }

  /** External driver accepts delivery */
  @Post(':orderId/:token/accept')
  async accept(@Param('orderId') orderId: string, @Param('token') token: string) {
    const a = await this.findAssignment(orderId, token);
    if (!a) throw new NotFoundException('Enlace no válido');
    if (a.status !== 'offered') throw new BadRequestException('Esta entrega ya fue aceptada o cancelada');

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${a.schemaName}".delivery_assignments
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = $1::uuid
    `, a.assignmentId);

    // Transition order to shipped
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${a.schemaName}".orders SET status = 'shipped', updated_at = NOW() WHERE id = $1::uuid
    `, orderId);

    return { success: true, message: 'Entrega aceptada. ¡Recoge el pedido!' };
  }

  /** External driver confirms pickup */
  @Post(':orderId/:token/pickup')
  async pickup(@Param('orderId') orderId: string, @Param('token') token: string) {
    const a = await this.findAssignment(orderId, token);
    if (!a) throw new NotFoundException('Enlace no válido');
    if (a.status !== 'accepted') throw new BadRequestException('Debes aceptar primero');

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${a.schemaName}".delivery_assignments
      SET status = 'picked_up', picked_up_at = NOW()
      WHERE id = $1::uuid
    `, a.assignmentId);

    return { success: true, message: 'Recogida confirmada. ¡En camino al cliente!' };
  }

  /** External driver confirms delivery */
  @Post(':orderId/:token/deliver')
  async deliver(@Param('orderId') orderId: string, @Param('token') token: string) {
    const a = await this.findAssignment(orderId, token);
    if (!a) throw new NotFoundException('Enlace no válido');
    if (a.status !== 'picked_up') throw new BadRequestException('Debes confirmar recogida primero');

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${a.schemaName}".delivery_assignments
      SET status = 'delivered', delivered_at = NOW()
      WHERE id = $1::uuid
    `, a.assignmentId);

    // Transition order to delivered
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${a.schemaName}".orders SET status = 'delivered', updated_at = NOW() WHERE id = $1::uuid
    `, orderId);

    return { success: true, message: '¡Entrega confirmada! Gracias.' };
  }

  // ─── Helper ───────────────────────────────────────────────────

  private async findAssignment(orderId: string, token: string) {
    // Search across all active tenants for this order + token combo
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { schemaName: true },
    });

    for (const t of tenants) {
      try {
        const rows = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT da.id AS "assignmentId", da.status, da.tracking_token,
                 da.offered_at AS "offeredAt", da.accepted_at AS "acceptedAt",
                 da.picked_up_at AS "pickedUpAt", da.delivered_at AS "deliveredAt",
                 o.order_number AS "orderNumber", o.total, o.items,
                 o.shipping_address AS "address",
                 c.name AS "customerName",
                 COALESCE(d.name, da.external_phone) AS "driverName"
          FROM "${t.schemaName}".delivery_assignments da
          JOIN "${t.schemaName}".orders o ON o.id = da.order_id
          JOIN "${t.schemaName}".customers c ON c.id = o.customer_id
          LEFT JOIN "${t.schemaName}".delivery_drivers d ON d.id = da.driver_id
          WHERE da.order_id = $1::uuid AND da.tracking_token = $2
          ORDER BY da.offered_at DESC LIMIT 1
        `, orderId, token);

        if (rows[0]) {
          return { ...rows[0], schemaName: t.schemaName };
        }
      } catch { /* skip tenants without table */ }
    }

    return null;
  }
}
