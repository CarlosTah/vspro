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

    return { success: true, message: 'Entrega aceptada. ¡Ve a recoger el pedido!' };
  }

  /** External driver confirms pickup — order transitions to 'shipped' */
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

    // Transition order to shipped — "en camino al cliente"
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${a.schemaName}".orders SET status = 'shipped', updated_at = NOW() WHERE id = $1::uuid
    `, orderId);

    // Notify customer that order is on the way
    await this.notifyCustomer(a.schemaName, orderId, 'shipped');

    return { success: true, message: 'Recogida confirmada. ¡En camino al cliente!' };
  }

  /** External driver confirms delivery — order transitions to 'delivered' + final notification */
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

    // Notify customer — final message "entregado, disfruta"
    await this.notifyCustomer(a.schemaName, orderId, 'delivered');

    return { success: true, message: '¡Entrega confirmada! Gracias.' };
  }

  // ─── Helpers ───────────────────────────────────────────────────

  /**
   * Send WhatsApp notification to customer when order status changes via tracking.
   * Uses the tenant's WhatsApp channel to send the message.
   */
  private async notifyCustomer(schemaName: string, orderId: string, status: 'shipped' | 'delivered'): Promise<void> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT o.order_number AS "orderNumber", c.name AS "customerName",
               c.channel_id AS "channelId", ch.external_id AS "phoneNumberId", ch.access_token AS "accessToken"
        FROM "${schemaName}".orders o
        JOIN "${schemaName}".customers c ON c.id = o.customer_id
        LEFT JOIN "${schemaName}".channels ch ON ch.type = 'whatsapp' AND ch.is_active = true
        WHERE o.id = $1::uuid
      `, orderId);

      const order = rows[0];
      if (!order?.channelId || !order.phoneNumberId || order.channelId.startsWith('manual-')) return;

      const name = order.customerName?.split(' ')[0] ?? '';
      const num = order.orderNumber;

      let message: string;
      if (status === 'shipped') {
        message = `🛵 *¡Tu pedido va en camino!*\n\n${name}, el repartidor ya recogió tu pedido *${num}* y va hacia ti.\n\n⏱ Llegará en aproximadamente 20-30 minutos.`;
      } else {
        message = `✅ *¡Pedido entregado!*\n\n${name}, tu pedido *${num}* fue entregado.\n\n¡Gracias por tu compra! 🙏 Que lo disfrutes.\n\nSi tienes algún comentario, escríbenos aquí.`;
      }

      // Send via Meta API directly
      const axios = (await import('axios')).default;
      await axios.post(
        `https://graph.facebook.com/v19.0/${order.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: order.channelId,
          type: 'text',
          text: { body: message, preview_url: false },
        },
        { headers: { Authorization: `Bearer ${order.accessToken}` } },
      );
    } catch (err: any) {
      // Non-blocking
    }
  }

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
