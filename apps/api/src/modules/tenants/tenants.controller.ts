import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { OnboardingService } from './onboarding.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { OnboardingCompleteDto } from './dto/onboarding.dto';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly _tenantsService: TenantsService,
    private readonly provisioning: TenantProvisioningService,
    private readonly onboarding: OnboardingService,
  ) {}

  /** Registro simple — solo crea el tenant */
  @Post('register')
  register(@Body() dto: CreateTenantDto) {
    return this.provisioning.provision(dto);
  }

  /** Onboarding completo — crea tenant + productos en un solo paso */
  @Post('onboarding')
  completeOnboarding(@Body() dto: OnboardingCompleteDto) {
    return this.onboarding.complete(dto);
  }

  /** Verificar disponibilidad de slug (para validación en tiempo real) */
  @Get('check-slug')
  checkSlug(@Query('slug') slug: string) {
    return this.onboarding.checkSlugAvailability(slug);
  }

  /** Info del tenant actual (resuelto por subdominio) */
  @Get('me')
  getMe() {
    return { message: 'Implementar con @CurrentTenant()' };
  }
}
