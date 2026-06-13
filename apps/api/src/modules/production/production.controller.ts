import {
  Controller, Get, Post, Body,
  Param, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProductionService } from './production.service';
import { AssignToProductionDto } from './dto/production.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';

@ApiTags('production')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  /** Cola de producción: pedidos pendientes y en proceso */
  @Get('queue')
  getQueue(@TenantSchema() schema: string) {
    return this.productionService.getQueue(schema);
  }

  /** Pedidos listos para envío */
  @Get('ready')
  getReady(@TenantSchema() schema: string) {
    return this.productionService.getReadyForShipment(schema);
  }

  /** Estadísticas de producción */
  @Get('stats')
  getStats(@TenantSchema() schema: string) {
    return this.productionService.getStats(schema);
  }

  /** Iniciar producción de un pedido */
  @Post(':orderId/start')
  startProduction(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: AssignToProductionDto,
    @TenantSchema() schema: string,
  ) {
    return this.productionService.startProduction(orderId, dto.assignedTo, schema);
  }

  /** Marcar pedido como listo (notifica al cliente automáticamente) */
  @Post(':orderId/ready')
  markReady(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @TenantSchema() schema: string,
  ) {
    return this.productionService.markReady(orderId, schema);
  }
}
