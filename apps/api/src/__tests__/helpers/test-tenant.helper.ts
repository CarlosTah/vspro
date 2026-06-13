import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantProvisioningService } from '../../modules/tenants/tenant-provisioning.service';

export interface TestTenant {
  id: string;
  slug: string;
  schemaName: string;
  authToken: string;
}

/**
 * Helper para crear y destruir tenants en tests.
 * Garantiza limpieza completa después de cada test.
 */
export class TestTenantHelper {
  constructor(
    private readonly app: INestApplication,
    private readonly prisma: PrismaService,
    private readonly provisioning: TenantProvisioningService,
  ) {}

  async createTenant(slug: string): Promise<TestTenant> {
    const tenant = await this.provisioning.provision({
      slug,
      businessName: `Test Business ${slug}`,
      email: `admin@${slug}.test`,
      ownerName: 'Test Admin',
      password: 'TestPassword123!',
    });

    // Obtener token de autenticación
    const authToken = await this.getAuthToken(slug, `admin@${slug}.test`);

    return {
      id: tenant.id,
      slug: tenant.slug,
      schemaName: tenant.schemaName,
      authToken,
    };
  }

  async destroyTenant(tenant: TestTenant): Promise<void> {
    try {
      await this.provisioning.deprovision(tenant.id);
    } catch (error) {
      console.warn(`No se pudo destruir tenant ${tenant.slug}:`, error);
    }
  }

  private async getAuthToken(slug: string, _email: string): Promise<string> {
    // En tests, generamos el token directamente sin pasar por HTTP
    // para evitar dependencias circulares
    const { JwtService } = await import('@nestjs/jwt');
    const jwtService = this.app.get(JwtService);

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { slug },
    });

    return jwtService.sign({
      sub: 'test-user-id',
      tenantId: tenant.id,
      tenantSchema: tenant.schemaName,
      tenantSlug: tenant.slug,
      role: 'admin',
    });
  }
}
