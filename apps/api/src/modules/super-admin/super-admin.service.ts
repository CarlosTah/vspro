import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ─── Métricas globales ────────────────────────────────────────

  async getStats() {
    const [tenantStats, subscriptionStats, usageStats] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT
          COUNT(*) AS "totalTenants",
          COUNT(*) FILTER (WHERE status = 'ACTIVE') AS "activeTenants",
          COUNT(*) FILTER (WHERE status = 'TRIAL') AS "trialTenants",
          COUNT(*) FILTER (WHERE status = 'SUSPENDED') AS "suspendedTenants"
        FROM public.tenants
      `,
      this.prisma.$queryRaw<any[]>`
        SELECT
          COALESCE(SUM(p."priceMonthly"), 0) AS "mrr"
        FROM public.subscriptions s
        JOIN public.plans p ON p.id = s."planId"
        WHERE s.status = 'ACTIVE'
      `,
      this.prisma.$queryRaw<any[]>`
        SELECT
          COALESCE(SUM("ordersCount"), 0) AS "totalOrders",
          COALESCE(SUM("messagesSent"), 0) AS "totalMessages",
          COALESCE(SUM("aiCalls"), 0) AS "totalAiCalls",
          COALESCE(SUM("ocrCalls"), 0) AS "totalOcrCalls"
        FROM public.usage_records
        WHERE period >= DATE_TRUNC('month', CURRENT_DATE)
      `,
    ]);

    const t = tenantStats[0];
    const s = subscriptionStats[0];
    const u = usageStats[0];

    return {
      tenants: {
        total: parseInt(t.totalTenants) || 0,
        active: parseInt(t.activeTenants) || 0,
        trial: parseInt(t.trialTenants) || 0,
        suspended: parseInt(t.suspendedTenants) || 0,
      },
      revenue: {
        mrr: parseFloat(s.mrr) || 0,
      },
      usage: {
        totalOrders: parseInt(u.totalOrders) || 0,
        totalMessages: parseInt(u.totalMessages) || 0,
        totalAiCalls: parseInt(u.totalAiCalls) || 0,
        totalOcrCalls: parseInt(u.totalOcrCalls) || 0,
      },
    };
  }

  // ─── Lista de tenants ─────────────────────────────────────────

  async listTenants() {
    return this.prisma.tenant.findMany({
      include: { plan: true, subscription: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTenantDetail(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true, subscription: true, usageRecords: { orderBy: { period: 'desc' }, take: 3 } },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');
    return tenant;
  }

  // ─── Impersonación ────────────────────────────────────────────

  /**
   * Genera un JWT temporal para que el super-admin pueda
   * "entrar" al panel de un tenant como si fuera su admin.
   * El token expira en 1 hora y tiene un flag de impersonación.
   */
  async impersonate(tenantId: string, superAdminId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    // Obtener el primer admin del tenant
    const users = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, email, name, role FROM "${tenant.schemaName}".users WHERE role = 'admin' LIMIT 1`,
    );

    if (!users[0]) throw new NotFoundException('No hay admin en este tenant');

    const token = this.jwt.sign(
      {
        sub: users[0].id,
        tenantId: tenant.id,
        tenantSchema: tenant.schemaName,
        tenantSlug: tenant.slug,
        role: 'admin',
        impersonatedBy: superAdminId,
      },
      { expiresIn: '1h' },
    );

    return {
      token,
      tenant: { slug: tenant.slug, businessName: tenant.businessName },
      user: { name: users[0].name, email: users[0].email },
      expiresIn: '1 hora',
      warning: 'Este token da acceso completo al tenant. Úsalo con responsabilidad.',
    };
  }

  // ─── Acciones sobre tenants ───────────────────────────────────

  async suspendTenant(tenantId: string) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'SUSPENDED' },
    });
    return { success: true, message: 'Tenant suspendido' };
  }

  async reactivateTenant(tenantId: string) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE' },
    });
    return { success: true, message: 'Tenant reactivado' };
  }
}
