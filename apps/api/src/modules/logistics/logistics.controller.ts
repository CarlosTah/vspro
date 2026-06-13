import { Controller, Get, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LogisticsService } from './logistics.service';
import { CreateShippingCalculationDto } from './dto/shipping-calculation.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';

@ApiTags('logistics')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  /** Calcular tarifas de envío */
  @Post('calculate')
  calculate(@Body() dto: CreateShippingCalculationDto, @TenantSchema() schema: string) {
    return this.logisticsService.calculateShipping(dto, schema);
  }

  /** Obtener zonas de envío configuradas */
  @Get('zones')
  getZones(@TenantSchema() schema: string) {
    return this.logisticsService.getShippingZones(schema);
  }

  /** Guardar tarifa seleccionada en un pedido */
  @Post('orders/:orderId/apply-rate')
  applyRate(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() rate: { carrier: string; service: string; price: number; estimatedDays: number; currency: string },
    @TenantSchema() schema: string,
  ) {
    return this.logisticsService.saveCalculation(orderId, rate, schema);
  }
}
