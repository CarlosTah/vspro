import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReservationsService, CreateReservationDto, PricingRuleDto } from './reservations.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('reservations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly service: ReservationsService) {}

  @Get()
  @Roles('admin', 'manager')
  list(@TenantSchema() schema: string) {
    return this.service.list(schema);
  }

  @Post()
  @Roles('admin', 'manager')
  create(@Body() dto: CreateReservationDto, @TenantSchema() schema: string) {
    return this.service.create(dto, schema);
  }

  @Patch(':id/status')
  @Roles('admin', 'manager')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: { status: string }, @TenantSchema() schema: string) {
    return this.service.updateStatus(id, body.status, schema);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  delete(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.service.delete(id, schema);
  }

  @Get('availability')
  @Roles('admin', 'manager')
  checkAvailability(@Query('checkIn') checkIn: string, @Query('checkOut') checkOut: string, @TenantSchema() schema: string) {
    return this.service.checkAvailability(checkIn, checkOut, schema);
  }

  @Get('calendar')
  @Roles('admin', 'manager')
  calendar(@Query('year') year: string, @Query('month') month: string, @TenantSchema() schema: string) {
    return this.service.getCalendarData(parseInt(year) || new Date().getFullYear(), parseInt(month) || new Date().getMonth() + 1, schema);
  }

  @Get('pricing')
  @Roles('admin', 'manager')
  getPricing(@TenantSchema() schema: string) {
    return this.service.getPricingRules(schema);
  }

  @Post('pricing')
  @Roles('admin')
  createPricing(@Body() dto: PricingRuleDto, @TenantSchema() schema: string) {
    return this.service.createPricingRule(dto, schema);
  }

  @Delete('pricing/:id')
  @Roles('admin')
  deletePricing(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.service.deletePricingRule(id, schema);
  }
}
