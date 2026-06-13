import {
  Controller, Get, Post, Body, Param,
  UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InvoicingService } from './invoicing.service';
import { CreateInvoiceDto } from './dto/invoice.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('invoicing')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('invoicing')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  /** Crear factura (CFDI) para un pedido */
  @Post()
  @Roles('admin', 'manager')
  create(@Body() dto: CreateInvoiceDto, @TenantSchema() schema: string) {
    return this.invoicingService.createInvoice(dto, schema);
  }

  /** Historial de facturas/entradas contables de un pedido */
  @Get('order/:orderId')
  @Roles('admin', 'manager')
  getByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @TenantSchema() schema: string,
  ) {
    return this.invoicingService.getByOrder(orderId, schema);
  }

  /** Resumen contable del mes actual */
  @Get('summary')
  @Roles('admin')
  getMonthlySummary(@TenantSchema() schema: string) {
    return this.invoicingService.getMonthlySummary(schema);
  }
}
