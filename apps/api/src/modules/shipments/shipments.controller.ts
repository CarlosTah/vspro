import {
  Controller, Get, Post, Patch,
  Body, Param, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';

@ApiTags('shipments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('order/:orderId')
  findByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @TenantSchema() schema: string,
  ) {
    return this.shipmentsService.findByOrder(orderId, schema);
  }

  @Post()
  create(@Body() dto: CreateShipmentDto, @TenantSchema() schema: string) {
    return this.shipmentsService.create(dto, schema);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: string,
    @TenantSchema() schema: string,
  ) {
    return this.shipmentsService.updateStatus(id, status, schema);
  }
}
