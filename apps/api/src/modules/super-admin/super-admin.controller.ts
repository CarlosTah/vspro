import {
  Controller, Get, Post, Patch, Param, Body, UseGuards, Req, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SuperAdminService } from './super-admin.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantProvisioningService } from '../tenants/tenant-provisioning.service';
import { IndustryTemplatesService } from '../tenants/industry-templates.service';

interface CreateTenantByAdminDto {
  slug: string;
  businessName: string;
  email: string;
  ownerName: string;
  password: string;
  industry?: string;
  planSlug?: string;
  trialDays?: number;
  skipPayment?: boolean;
}

@ApiTags('super-admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin') // Only tenant admins can access (super_admin role in future)
@Controller('super-admin')
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly tenantProvisioning: TenantProvisioningService,
    private readonly industryTemplates: IndustryTemplatesService,
  ) {}

  @Post('tenants')
  async createTenant(@Body() dto: CreateTenantByAdminDto) {
    // 1. Provision tenant
    const tenant = await this.tenantProvisioning.provision({
      slug: dto.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      businessName: dto.businessName,
      email: dto.email,
      ownerName: dto.ownerName,
      password: dto.password,
    });

    // 2. Custom trial days (override default 7)
    if (dto.trialDays && dto.trialDays !== 7) {
      const trialEnd = new Date(Date.now() + dto.trialDays * 24 * 60 * 60 * 1000);
      await this.superAdminService.updateTenantTrialEnd(tenant.id, trialEnd);
    }

    // 3. Change plan if not basic
    if (dto.planSlug && dto.planSlug !== 'basic') {
      await this.superAdminService.changeTenantPlan(tenant.id, dto.planSlug);
    }

    // 4. Skip payment — mark as ACTIVE directly
    if (dto.skipPayment) {
      await this.superAdminService.activateTenantManually(tenant.id);
    }

    // 5. Apply industry template
    let templateApplied = null;
    if (dto.industry) {
      try {
        templateApplied = await this.industryTemplates.applyTemplate(dto.industry, tenant.schemaName);
      } catch {
        // Template failure is non-critical
      }
    }

    return {
      success: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        businessName: tenant.businessName,
        schemaName: tenant.schemaName,
        status: dto.skipPayment ? 'ACTIVE' : 'TRIAL',
        trialEndsAt: tenant.trialEndsAt,
      },
      templateApplied: templateApplied ? dto.industry : null,
    };
  }

  @Get('stats')
  getStats() {
    return this.superAdminService.getStats();
  }

  @Get('tenants')
  listTenants() {
    return this.superAdminService.listTenants();
  }

  @Get('tenants/:id')
  getTenantDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.superAdminService.getTenantDetail(id);
  }

  @Post('tenants/:id/impersonate')
  impersonate(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.superAdminService.impersonate(id, req.user.sub);
  }

  @Post('tenants/:id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.superAdminService.suspendTenant(id);
  }

  @Post('tenants/:id/reactivate')
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.superAdminService.reactivateTenant(id);
  }

  // ─── Tenant Detail Actions ────────────────────────────────────

  @Patch('tenants/:id')
  updateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { businessName?: string; ownerEmail?: string; ownerName?: string; settings?: Record<string, any> },
  ) {
    return this.superAdminService.updateTenantData(id, dto);
  }

  @Post('tenants/:id/extend-trial')
  extendTrial(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { days: number },
  ) {
    return this.superAdminService.extendTrial(id, dto.days);
  }

  @Post('tenants/:id/change-plan')
  changePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { planSlug: string },
  ) {
    return this.superAdminService.changeTenantPlan(id, dto.planSlug);
  }

  @Post('tenants/:id/add-grace-days')
  addGraceDays(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { days: number },
  ) {
    return this.superAdminService.addGraceDays(id, dto.days);
  }

  @Post('tenants/:id/manual-payment')
  manualPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { amount: number; reference?: string; note?: string },
  ) {
    return this.superAdminService.recordManualPayment(id, dto);
  }

  @Get('tenants/:id/usage')
  getTenantUsage(@Param('id', ParseUUIDPipe) id: string) {
    return this.superAdminService.getTenantUsage(id);
  }

  @Get('tenants/:id/payments')
  getTenantPayments(@Param('id', ParseUUIDPipe) id: string) {
    return this.superAdminService.getTenantPayments(id);
  }

  @Post('tenants/:id/add-product')
  addProductToTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { name: string; price: number; category?: string; description?: string },
  ) {
    return this.superAdminService.addProductToTenant(id, dto);
  }

  // ─── Plan Management ──────────────────────────────────────────

  @Get('plans')
  listPlans() {
    return this.superAdminService.listPlans();
  }

  @Post('plans')
  createPlan(@Body() dto: {
    name: string;
    slug: string;
    priceMonthly: number;
    priceYearly: number;
    features: Record<string, any>;
  }) {
    return this.superAdminService.createPlan(dto);
  }

  @Patch('plans/:id')
  updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: {
      name?: string;
      priceMonthly?: number;
      priceYearly?: number;
      features?: Record<string, any>;
      stripePriceIdMonthly?: string;
      stripePriceIdYearly?: string;
    },
  ) {
    return this.superAdminService.updatePlan(id, dto);
  }

  @Patch('plans/:id/toggle')
  togglePlan(@Param('id', ParseUUIDPipe) id: string) {
    return this.superAdminService.togglePlan(id);
  }

  // ─── Analytics ────────────────────────────────────────────────

  @Get('analytics')
  getAnalytics() {
    return this.superAdminService.getAnalytics();
  }

  // ─── Broadcasts ───────────────────────────────────────────────

  @Post('broadcast')
  sendBroadcast(@Body() dto: {
    message: string;
    filter?: 'all' | 'active' | 'trial' | 'suspended';
  }) {
    return this.superAdminService.sendBroadcast(dto.message, dto.filter ?? 'all');
  }

  @Get('broadcasts')
  getBroadcasts() {
    return this.superAdminService.getBroadcastHistory();
  }
}
