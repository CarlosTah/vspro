import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TeamController } from './team.controller';
import { IndustryTemplatesController } from './industry-templates.controller';
import { TenantsService } from './tenants.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { OnboardingService } from './onboarding.service';
import { IndustryTemplatesService } from './industry-templates.service';
import { TeamService } from './team.service';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [TenantsController, TeamController, IndustryTemplatesController],
  providers: [TenantsService, TenantProvisioningService, OnboardingService, IndustryTemplatesService, TeamService],
  exports: [TenantsService, TenantProvisioningService, IndustryTemplatesService],
})
export class TenantsModule {}
