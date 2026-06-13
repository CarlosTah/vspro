import {
  Controller, Get, Post, Body, Req,
  Headers, HttpCode, UseGuards, RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { QuotaService } from './quota.service';
import { CreateCheckoutDto, CreatePortalSessionDto } from './dto/billing.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantSchema, CurrentTenant } from '../../common/decorators/tenant.decorator';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly quotaService: QuotaService,
  ) {}

  /** Info de la suscripción actual del tenant */
  @Get('subscription')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  getSubscription(@Req() req: any) {
    return this.billingService.getSubscriptionInfo(req.user.tenantId);
  }

  /** Resumen de uso del mes actual (quotas) */
  @Get('usage')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  getUsage(@Req() req: any) {
    return this.quotaService.getUsageSummary(req.user.tenantId);
  }

  /** Crear sesión de Stripe Checkout para suscribirse/cambiar plan */
  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  createCheckout(@Body() dto: CreateCheckoutDto, @Req() req: any) {
    return this.billingService.createCheckoutSession(
      req.user.tenantId,
      dto.planSlug,
      dto.interval,
    );
  }

  /** Crear sesión del portal de Stripe (gestionar tarjeta, cancelar, etc.) */
  @Post('portal')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  createPortal(@Body() dto: CreatePortalSessionDto, @Req() req: any) {
    return this.billingService.createPortalSession(req.user.tenantId, dto.returnUrl);
  }

  /** Webhook de Stripe — NO requiere autenticación JWT */
  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody ?? Buffer.from('');
    return this.billingService.handleWebhook(rawBody, signature);
  }
}
