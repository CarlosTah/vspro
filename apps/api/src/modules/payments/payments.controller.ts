import {
  Controller, Get, Post, Patch,
  Body, Param, UseGuards, ParseUUIDPipe, Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { VerifyPaymentByImageDto, ManualVerifyPaymentDto } from './dto/verify-payment.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Historial de pagos de un pedido */
  @Get('order/:orderId')
  findByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @TenantSchema() schema: string,
  ) {
    return this.paymentsService.findByOrder(orderId, schema);
  }

  /**
   * Verificar pago por imagen de comprobante (OCR con GPT-4o Vision).
   * El cliente envía la URL de la imagen del comprobante.
   * El sistema extrae el monto y verifica automáticamente.
   */
  @Post('verify-by-image')
  verifyByImage(
    @Body() dto: VerifyPaymentByImageDto,
    @TenantSchema() schema: string,
    @Req() req: any,
  ) {
    return this.paymentsService.verifyByImage(dto, schema, req.user?.sub);
  }

  /**
   * Verificación manual por un operador.
   * Útil cuando el OCR falla o para pagos en efectivo.
   */
  @Post('verify-manual')
  verifyManually(
    @Body() dto: ManualVerifyPaymentDto,
    @TenantSchema() schema: string,
    @Req() req: any,
  ) {
    return this.paymentsService.verifyManually(dto, schema, req.user?.sub);
  }

  /** Rechazar un pago pendiente de revisión */
  @Patch(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.paymentsService.rejectPayment(id, schema);
  }
}
