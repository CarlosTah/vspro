import { Controller, Get, Post, Param, UseGuards, Req, ParseUUIDPipe, Header, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { KitchenService } from './kitchen.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('kitchen')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('kitchen')
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  /**
   * Get full kitchen queue (pending + cooking + ready).
   * Used by the Kitchen Display screen.
   */
  @Get('queue')
  @Roles('admin', 'manager', 'operator')
  getQueue(@TenantSchema() schema: string, @Req() req: any) {
    return this.kitchen.getKitchenQueue(schema, req.tenantId);
  }

  /**
   * Get only pending orders (new orders waiting to start).
   */
  @Get('pending')
  @Roles('admin', 'manager', 'operator')
  getPending(@TenantSchema() schema: string) {
    return this.kitchen.getPendingOrders(schema);
  }

  /**
   * Get kitchen statistics (today).
   */
  @Get('stats')
  @Roles('admin', 'manager', 'operator')
  getStats(@TenantSchema() schema: string) {
    return this.kitchen.getStats(schema);
  }

  /**
   * Start cooking an order (payment_verified → in_production).
   */
  @Post(':id/start')
  @Roles('admin', 'manager', 'operator')
  startCooking(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
    @Req() req: any,
  ) {
    return this.kitchen.startCooking(id, schema, req.tenantId);
  }

  /**
   * Mark order as ready (in_production → ready).
   */
  @Post(':id/ready')
  @Roles('admin', 'manager', 'operator')
  markReady(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
    @Req() req: any,
  ) {
    return this.kitchen.markReady(id, schema, req.tenantId);
  }

  /**
   * Get ticket data for printing (structured JSON).
   */
  @Get(':id/ticket')
  @Roles('admin', 'manager', 'operator')
  getTicket(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.kitchen.getTicketData(id, schema);
  }

  /**
   * Get plain-text ticket (for thermal printers / raw print).
   * Returns text/plain content type.
   */
  @Get(':id/ticket/print')
  @Roles('admin', 'manager', 'operator')
  async printTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
    @Res() res: Response,
  ) {
    const text = await this.kitchen.getPlainTextTicket(id, schema);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="ticket-${id}.txt"`);
    res.send(text);
  }
}
