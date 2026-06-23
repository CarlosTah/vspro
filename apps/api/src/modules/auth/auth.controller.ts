import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TenantProvisioningService } from '../tenants/tenant-provisioning.service';
import { IndustryTemplatesService } from '../tenants/industry-templates.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tenantProvisioning: TenantProvisioningService,
    private readonly industryTemplates: IndustryTemplatesService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    // 1. Provision tenant (schema, user, AI config)
    const tenant = await this.tenantProvisioning.provision({
      slug: dto.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      businessName: dto.businessName,
      email: dto.email,
      ownerName: dto.ownerName,
      password: dto.password,
    });

    // 2. Apply industry template
    let templateResult: any = null;
    try {
      templateResult = await this.industryTemplates.applyTemplate(dto.industry, tenant.schemaName);
    } catch {
      // Template failure is non-critical
    }

    // 3. Auto-login: generate JWT
    const loginResult = await this.authService.login(dto.email, dto.password, tenant.slug);

    return {
      success: true,
      ...loginResult,
      tenant: {
        ...loginResult.tenant,
        trialEndsAt: tenant.trialEndsAt,
      },
      templateApplied: templateResult ? dto.industry : null,
    };
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: any) {
    // El tenantSlug viene del middleware (resuelto por subdominio o header)
    const tenantSlug = req.tenant?.slug ?? dto.tenantSlug;
    return this.authService.login(dto.email, dto.password, tenantSlug);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  me(@Req() req: any) {
    return req.user;
  }
}
