import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DeliveryService, CreateDriverDto, RequestDeliveryDto } from './delivery.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('delivery')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

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
}
