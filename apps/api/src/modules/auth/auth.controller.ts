import { Controller, Post, Body, Get, Patch, UseGuards, Req } from '@nestjs/common';
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

    // 2.5 Save industry in tenant settings
    try {
      await this.tenantProvisioning['prisma'].tenant.update({
        where: { id: tenant.id },
        data: { settings: { industry: dto.industry } },
      });
    } catch {}

    // 2.6 Notify super admin about new registration
    try {
      const { MessagingFactory } = await import('../messaging/messaging-factory.service');
      const prisma = this.tenantProvisioning['prisma'];
      // Send to VSPRO admin phone if available
      const admins = await prisma.$queryRawUnsafe<any[]>(`
        SELECT phone FROM "tenant_vspro".users WHERE role = 'admin' AND phone IS NOT NULL LIMIT 1
      `);
      if (admins[0]?.phone) {
        const msg = `🆕 *Nuevo registro en VSPRO*\n\n` +
          `📋 Negocio: ${dto.businessName}\n` +
          `👤 Dueño: ${dto.ownerName}\n` +
          `📧 Email: ${dto.email}\n` +
          `🏪 Giro: ${dto.industry}\n` +
          `🔗 Slug: ${dto.slug}\n\n` +
          `Ve a Super Admin para más detalles.`;
        // Use messaging factory from VSPRO's channel
        const channels = await prisma.$queryRawUnsafe<any[]>(`
          SELECT external_id, access_token FROM "tenant_vspro".channels WHERE type = 'whatsapp' AND is_active = true LIMIT 1
        `).catch(() => []);
        if (channels[0]) {
          const axios = (await import('axios')).default;
          await axios.post(
            `https://graph.facebook.com/v19.0/${channels[0].external_id}/messages`,
            { messaging_product: 'whatsapp', to: admins[0].phone, type: 'text', text: { body: msg } },
            { headers: { Authorization: `Bearer ${channels[0].access_token}` } },
          ).catch(() => {});
        }
      }
    } catch {}

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

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async updateProfile(@Req() req: any, @Body() dto: { phone?: string; name?: string }) {
    const schema = req.user.tenantSchema;
    const userId = req.user.sub;

    // Ensure phone column exists
    await this.authService.updateUserProfile(userId, dto, schema);
    return { success: true };
  }
}
