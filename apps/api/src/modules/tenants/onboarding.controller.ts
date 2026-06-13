import { Controller, Post, Get, Body, UseGuards, HttpCode } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OnboardingService, OnboardingData } from './onboarding.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('onboarding')
@Controller('tenants')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /**
   * Complete onboarding — creates tenant + products + config.
   * Public endpoint (no auth required — this IS the registration).
   */
  @Post('onboarding')
  @HttpCode(201)
  async completeOnboarding(@Body() data: OnboardingData) {
    return this.onboarding.completeOnboarding(data);
  }

  /**
   * Check onboarding status for an existing tenant.
   * Authenticated — only the tenant admin can check.
   */
  @Get('onboarding/status')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  async getStatus(@TenantSchema() schema: string) {
    return this.onboarding.getOnboardingStatus(schema);
  }
}
