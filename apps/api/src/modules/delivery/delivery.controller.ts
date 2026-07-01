import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DeliveryService, CreateDriverDto, RequestDeliveryDto } from './delivery.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('delivery')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('delivery')
export class DeliveryController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Drivers CRUD ─────────────────────────────────────────────

  /** List all delivery drivers */
  @Get('drivers')
  @Roles('admin', 'manager')
  getDrivers(@TenantSchema() schema: string) {
    return this.delivery.getDrivers(schema);
  }

  /** Get available drivers (for assignment) */
  @Get('drivers/available')
  @Roles('admin', 'manager', 'operator')
  getAvailableDrivers(@TenantSchema() schema: string) {
    return this.delivery.getAvailableDrivers(schema);
  }

  /** Register a new driver */
  @Post('drivers')
  @Roles('admin', 'manager')
  createDriver(@Body() dto: CreateDriverDto, @TenantSchema() schema: string) {
    return this.delivery.createDriver(dto, schema);
  }

  /** Update driver status (available/busy/offline) */
  @Patch('drivers/:id/status')
  @Roles('admin', 'manager')
  updateDriverStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: 'available' | 'busy' | 'offline' },
    @TenantSchema() schema: string,
  ) {
    return this.delivery.updateDriverStatus(id, body.status, schema);
  }

  /** Remove a driver */
  @Delete('drivers/:id')
  @Roles('admin')
  deleteDriver(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.delivery.deleteDriver(id, schema);
  }

  // ─── Delivery Assignments ─────────────────────────────────────

  /** Request delivery for an order (auto-assign or specific driver) */
  @Post('request')
  @Roles('admin', 'manager', 'operator')
  requestDelivery(@Body() dto: RequestDeliveryDto, @TenantSchema() schema: string, @Req() req: any) {
    return this.delivery.requestDelivery(dto, schema, req.tenantId);
  }

  /** Driver accepts delivery */
  @Post('assignments/:id/accept')
  @Roles('admin', 'manager', 'operator')
  acceptDelivery(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string, @Req() req: any) {
    return this.delivery.acceptDelivery(id, schema, req.tenantId);
  }

  /** Driver confirms pickup */
  @Post('assignments/:id/pickup')
  @Roles('admin', 'manager', 'operator')
  confirmPickup(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string, @Req() req: any) {
    return this.delivery.confirmPickup(id, schema, req.tenantId);
  }

  /** Driver confirms delivery complete */
  @Post('assignments/:id/deliver')
  @Roles('admin', 'manager', 'operator')
  confirmDelivery(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string, @Req() req: any) {
    return this.delivery.confirmDelivery(id, schema, req.tenantId);
  }

  /** Driver rejects — auto-reassign to next */
  @Post('assignments/:id/reject')
  @Roles('admin', 'manager', 'operator')
  rejectDelivery(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string, @Req() req: any) {
    return this.delivery.rejectDelivery(id, schema, req.tenantId);
  }

  // ─── Queries ──────────────────────────────────────────────────

  /** Get active deliveries (in progress) */
  @Get('active')
  @Roles('admin', 'manager', 'operator')
  getActive(@TenantSchema() schema: string) {
    return this.delivery.getActiveDeliveries(schema);
  }

  /** Get delivery history */
  @Get('history')
  @Roles('admin', 'manager')
  getHistory(
    @TenantSchema() schema: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.delivery.getDeliveryHistory(schema, limit);
  }

  /** Dispatch to external driver (moto-mandado) via WhatsApp — no registered driver needed */
  @Post('dispatch-external')
  @Roles('admin', 'manager')
  async dispatchExternal(
    @Body() body: { orderId: string; phone: string; driverName?: string },
    @TenantSchema() schema: string,
    @Req() req: any,
  ) {
    return this.delivery.dispatchExternal(body.orderId, body.phone, body.driverName, schema, req.user.tenantId);
  }

  // ─── Assignments History & Driver Payments ────────────────────

  /** Get all delivery assignments with timeline */
  @Get('assignments')
  @Roles('admin', 'manager')
  async getAssignments(@TenantSchema() schema: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT da.id, da.status, da.offered_at AS "offeredAt", da.accepted_at AS "acceptedAt",
             da.picked_up_at AS "pickedUpAt", da.delivered_at AS "deliveredAt",
             da.created_at AS "createdAt",
             o.order_number AS "orderNumber", o.total AS "orderTotal",
             o.shipping_address AS "shippingAddress",
             c.name AS "customerName",
             COALESCE(d.name, da.external_phone) AS "driverName",
             d.phone AS "driverPhone", d.delivery_fee AS "deliveryFee"
      FROM "${schema}".delivery_assignments da
      JOIN "${schema}".orders o ON o.id = da.order_id
      JOIN "${schema}".customers c ON c.id = o.customer_id
      LEFT JOIN "${schema}".delivery_drivers d ON d.id = da.driver_id
      ORDER BY da.created_at DESC
      LIMIT 50
    `).catch(() => []);
  }

  /** Get driver payment summary */
  @Get('drivers/:id/payments')
  @Roles('admin', 'manager')
  async getDriverPayments(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    const driver = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, phone, delivery_fee AS "deliveryFee",
             total_earned AS "totalEarned", total_paid AS "totalPaid",
             (COALESCE(total_earned, 0) - COALESCE(total_paid, 0)) AS "balance"
      FROM "${schema}".delivery_drivers WHERE id = $1::uuid
    `, id);

    const deliveries = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT da.id, da.status, da.delivered_at AS "deliveredAt",
             o.order_number AS "orderNumber", d.delivery_fee AS "fee"
      FROM "${schema}".delivery_assignments da
      JOIN "${schema}".orders o ON o.id = da.order_id
      LEFT JOIN "${schema}".delivery_drivers d ON d.id = da.driver_id
      WHERE da.driver_id = $1::uuid AND da.status = 'delivered'
      ORDER BY da.delivered_at DESC
      LIMIT 50
    `, id);

    return { driver: driver[0] ?? null, deliveries };
  }

  /** Record payment to a driver */
  @Post('drivers/:id/pay')
  @Roles('admin')
  async payDriver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { amount: number; note?: string },
    @TenantSchema() schema: string,
  ) {
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schema}".delivery_drivers ADD COLUMN IF NOT EXISTS total_paid DECIMAL(10,2) NOT NULL DEFAULT 0
    `);
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".delivery_drivers
      SET total_paid = COALESCE(total_paid, 0) + $1
      WHERE id = $2::uuid
    `, body.amount, id);
    return { success: true, message: `Pago de $${body.amount} registrado` };
  }

  /** Get delivery shipping cost config */
  @Get('shipping-cost')
  @Roles('admin', 'manager')
  async getShippingCost(@TenantSchema() schema: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT agent_config->'deliverySettings'->'shippingCost' AS "shippingCost"
      FROM "${schema}".ai_config LIMIT 1
    `).catch(() => []);
    return { shippingCost: rows[0]?.shippingCost ?? 0 };
  }

  /** Set delivery shipping cost */
  @Post('shipping-cost')
  @Roles('admin')
  async setShippingCost(@Body() body: { cost: number }, @TenantSchema() schema: string) {
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schema}".ai_config ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}'
    `);
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".ai_config
      SET agent_config = jsonb_set(
        jsonb_set(COALESCE(agent_config, '{}'::jsonb), '{deliverySettings}', COALESCE(agent_config->'deliverySettings', '{}'::jsonb)),
        '{deliverySettings,shippingCost}',
        $1::jsonb
      ), updated_at = NOW()
      WHERE id = (SELECT id FROM "${schema}".ai_config LIMIT 1)
    `, JSON.stringify(body.cost));
    return { success: true, shippingCost: body.cost };
  }
}
