import {
  Controller, Get, Post, Patch, Body,
  Param, Query, UseGuards, UseInterceptors, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { TrackUsage } from '../../common/decorators/track-usage.decorator';
import { QuotaGuard } from '../../common/guards/quota.guard';
import { UsageTrackerInterceptor } from '../../common/interceptors/usage-tracker.interceptor';
import { OrderStatus } from '@vspro/shared';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiQuery({ name: 'status', required: false })
  findAll(
    @TenantSchema() schema: string,
    @Query('status') status?: string,
  ) {
    return this.ordersService.findAll(schema, status);
  }

  @Get('analytics/cancellations')
  async getCancellationMetrics(@TenantSchema() schema: string) {
    return this.ordersService.getCancellationMetrics(schema);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.ordersService.findById(id, schema);
  }

  @Post()
  @TrackUsage('orders')
  @UseGuards(QuotaGuard)
  @UseInterceptors(UsageTrackerInterceptor)
  create(@Body() dto: CreateOrderDto, @TenantSchema() schema: string) {
    return this.ordersService.create(dto, schema);
  }

  // Transiciones de estado — un endpoint por acción para mayor claridad

  @Post(':id/quote')
  quote(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.ordersService.transition(id, 'quoted', schema);
  }

  @Post(':id/request-payment')
  requestPayment(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.ordersService.transition(id, 'payment_pending', schema);
  }

  @Post(':id/verify-payment')
  verifyPayment(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.ordersService.transition(id, 'payment_verified', schema);
  }

  @Post(':id/start-production')
  startProduction(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.ordersService.transition(id, 'in_production', schema);
  }

  @Post(':id/mark-ready')
  markReady(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.ordersService.transition(id, 'ready', schema);
  }

  @Post(':id/ship')
  ship(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.ordersService.transition(id, 'shipped', schema);
  }

  @Post(':id/deliver')
  deliver(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.ordersService.transition(id, 'delivered', schema);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.ordersService.transition(id, 'cancelled', schema);
  }

  @Patch(':id/shipping-address')
  updateShippingAddress(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() address: Record<string, any>,
    @TenantSchema() schema: string,
  ) {
    return this.ordersService.updateShippingAddress(id, address, schema);
  }
}
