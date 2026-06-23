import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { MessagingFactory } from '../messaging/messaging-factory.service';

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly messaging: MessagingFactory,
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

  // ─── Admin Tenant Creation Helpers ────────────────────────────

  async updateTenantTrialEnd(tenantId: string, trialEnd: Date) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { trialEndsAt: trialEnd },
    });
  }

  async changeTenantPlan(tenantId: string, planSlug: string) {
    const plan = await this.prisma.plan.findFirst({
      where: { slug: planSlug, isActive: true },
    });
    if (!plan) return;

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { planId: plan.id },
    });
    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: { planId: plan.id },
    });
  }

  async activateTenantManually(tenantId: string) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE' },
    });
    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: { status: 'ACTIVE' },
    });
  }

  // ─── Tenant Detail Actions ────────────────────────────────────

  async updateTenantData(tenantId: string, dto: { businessName?: string; ownerEmail?: string; ownerName?: string; settings?: Record<string, any> }) {
    const data: any = {};
    if (dto.businessName) data.businessName = dto.businessName;
    if (dto.ownerEmail) data.ownerEmail = dto.ownerEmail;
    if (dto.ownerName) data.ownerName = dto.ownerName;
    if (dto.settings) data.settings = dto.settings;

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data,
      include: { plan: true },
    });
  }

  async extendTrial(tenantId: string, days: number) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    const currentEnd = tenant.trialEndsAt ?? new Date();
    const baseDate = currentEnd > new Date() ? currentEnd : new Date();
    const newEnd = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { trialEndsAt: newEnd, status: 'TRIAL' },
    });

    return { success: true, trialEndsAt: newEnd, daysAdded: days };
  }

  async addGraceDays(tenantId: string, days: number) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    const currentEnd = tenant.trialEndsAt ?? new Date();
    const newEnd = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { trialEndsAt: newEnd },
    });

    return { success: true, trialEndsAt: newEnd, graceDaysAdded: days };
  }

  async recordManualPayment(tenantId: string, dto: { amount: number; reference?: string; note?: string }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    // Record in payment_history (raw SQL since it's not in Prisma schema for public)
    await this.prisma.$executeRaw`
      INSERT INTO public.payment_history (tenant_id, amount, reference, note, type, created_at)
      VALUES (${tenantId}::uuid, ${dto.amount}, ${dto.reference ?? ''}, ${dto.note ?? 'Pago manual admin'}, 'manual', NOW())
    `.catch(() => {
      // Table might not exist, create it
    });

    // Ensure table exists then insert
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.payment_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES public.tenants(id),
        amount DECIMAL(10,2) NOT NULL,
        reference VARCHAR(255) DEFAULT '',
        note TEXT DEFAULT '',
        type VARCHAR(50) DEFAULT 'manual',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO public.payment_history (tenant_id, amount, reference, note, type)
      VALUES ($1::uuid, $2, $3, $4, 'manual')
    `, tenantId, dto.amount, dto.reference ?? '', dto.note ?? 'Pago manual admin');

    // Activate tenant if currently suspended or trial
    if (tenant.status !== 'ACTIVE') {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'ACTIVE' },
      });
      await this.prisma.subscription.updateMany({
        where: { tenantId },
        data: { status: 'ACTIVE' },
      });
    }

    return { success: true, message: `Pago de $${dto.amount} registrado`, status: 'ACTIVE' };
  }

  async getTenantUsage(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    try {
      const [orders, products, customers, messages] = await Promise.all([
        this.prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as total FROM "${tenant.schemaName}".orders`),
        this.prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as total FROM "${tenant.schemaName}".products WHERE is_active = true`),
        this.prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as total FROM "${tenant.schemaName}".customers`),
        this.prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as total FROM "${tenant.schemaName}".messages`),
      ]);

      const ordersThisMonth = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as revenue
        FROM "${tenant.schemaName}".orders
        WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
      `);

      return {
        totalOrders: parseInt(orders[0]?.total) || 0,
        totalProducts: parseInt(products[0]?.total) || 0,
        totalCustomers: parseInt(customers[0]?.total) || 0,
        totalMessages: parseInt(messages[0]?.total) || 0,
        ordersThisMonth: parseInt(ordersThisMonth[0]?.total) || 0,
        revenueThisMonth: parseFloat(ordersThisMonth[0]?.revenue) || 0,
      };
    } catch {
      return { totalOrders: 0, totalProducts: 0, totalCustomers: 0, totalMessages: 0, ordersThisMonth: 0, revenueThisMonth: 0 };
    }
  }

  async getTenantPayments(tenantId: string) {
    try {
      const payments = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT id, amount, reference, note, type, created_at AS "createdAt"
        FROM public.payment_history
        WHERE tenant_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 50
      `, tenantId);
      return payments;
    } catch {
      return [];
    }
  }

  async addProductToTenant(tenantId: string, dto: { name: string; price: number; category?: string; description?: string }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    const sku = `PRD-${Date.now().toString(36).toUpperCase()}`;
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${tenant.schemaName}".products (name, price, category, description, sku, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
    `, dto.name, dto.price, dto.category ?? 'General', dto.description ?? '', sku);

    // Create inventory
    const products = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "${tenant.schemaName}".products WHERE sku = $1`, sku,
    );
    if (products[0]) {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${tenant.schemaName}".inventory (product_id, stock_available, stock_minimum)
        VALUES ($1::uuid, 50, 5)
        ON CONFLICT (product_id) DO NOTHING
      `, products[0].id);
    }

    return { success: true, product: { name: dto.name, price: dto.price, sku } };
  }

  // ─── Plan Management ──────────────────────────────────────────

  async listPlans() {
    return this.prisma.plan.findMany({
      orderBy: { priceMonthly: 'asc' },
    });
  }

  async createPlan(dto: {
    name: string;
    slug: string;
    priceMonthly: number;
    priceYearly: number;
    features: Record<string, any>;
  }) {
    return this.prisma.plan.create({
      data: {
        name: dto.name,
        slug: dto.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        priceMonthly: dto.priceMonthly,
        priceYearly: dto.priceYearly,
        features: dto.features ?? {},
        isActive: true,
      },
    });
  }

  async updatePlan(id: string, dto: {
    name?: string;
    priceMonthly?: number;
    priceYearly?: number;
    features?: Record<string, any>;
    stripePriceIdMonthly?: string;
    stripePriceIdYearly?: string;
  }) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');

    return this.prisma.plan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.priceMonthly !== undefined && { priceMonthly: dto.priceMonthly }),
        ...(dto.priceYearly !== undefined && { priceYearly: dto.priceYearly }),
        ...(dto.features !== undefined && { features: dto.features }),
        ...(dto.stripePriceIdMonthly !== undefined && { stripePriceIdMonthly: dto.stripePriceIdMonthly }),
        ...(dto.stripePriceIdYearly !== undefined && { stripePriceIdYearly: dto.stripePriceIdYearly }),
      },
    });
  }

  async togglePlan(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');

    const updated = await this.prisma.plan.update({
      where: { id },
      data: { isActive: !plan.isActive },
    });

    return { success: true, isActive: updated.isActive };
  }

  // ─── Analytics ────────────────────────────────────────────────

  async getAnalytics() {
    const tenants = await this.prisma.tenant.findMany({
      include: { plan: true, subscription: true },
    });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // ─── Churn Rate (last 30 days) ───
    // Tenants that went from ACTIVE/TRIAL to SUSPENDED or CANCELLED in last 30 days
    const activeLast30 = tenants.filter(t => t.status === 'ACTIVE' || t.status === 'TRIAL').length;
    const suspended = tenants.filter(t => t.status === 'SUSPENDED').length;
    const totalActive = activeLast30 + suspended; // approximate base
    const churnRate = totalActive > 0 ? (suspended / totalActive) * 100 : 0;

    // ─── Conversion Rate (trial → paid) ───
    const totalTrialEver = tenants.length; // all tenants started as trial
    const totalPaid = tenants.filter(t => t.status === 'ACTIVE').length;
    const conversionRate = totalTrialEver > 0 ? (totalPaid / totalTrialEver) * 100 : 0;

    // ─── LTV (Lifetime Value) ───
    const planPrices: Record<string, number> = {};
    tenants.forEach(t => { if (t.plan) planPrices[t.plan.slug] = parseFloat(String(t.plan.priceMonthly)); });
    const avgMonthlyRevenue = totalPaid > 0
      ? tenants.filter(t => t.status === 'ACTIVE').reduce((sum, t) => sum + (planPrices[t.plan?.slug] ?? 0), 0) / totalPaid
      : 0;
    const avgLifetimeMonths = churnRate > 0 ? 100 / churnRate : 12; // estimate
    const ltv = avgMonthlyRevenue * Math.min(avgLifetimeMonths, 24);

    // ─── Growth Rate (new tenants last 30 days vs previous 30 days) ───
    const newLast30 = tenants.filter(t => new Date(t.createdAt) >= thirtyDaysAgo).length;
    const newPrev30 = tenants.filter(t => new Date(t.createdAt) >= sixtyDaysAgo && new Date(t.createdAt) < thirtyDaysAgo).length;
    const growthRate = newPrev30 > 0 ? ((newLast30 - newPrev30) / newPrev30) * 100 : (newLast30 > 0 ? 100 : 0);

    // ─── MRR ───
    const mrr = tenants
      .filter(t => t.status === 'ACTIVE')
      .reduce((sum, t) => sum + (planPrices[t.plan?.slug] ?? 0), 0);

    // ─── Most Active Tenants (by usage) ───
    let topTenants: any[] = [];
    try {
      const usageData = await this.prisma.$queryRaw<any[]>`
        SELECT u."tenantId", t."businessName", t.slug, t.status, p.name AS "planName",
               COALESCE(u."ordersCount", 0) AS "orders",
               COALESCE(u."messagesSent", 0) AS "messages",
               COALESCE(u."aiCalls", 0) AS "aiCalls"
        FROM public.usage_records u
        JOIN public.tenants t ON t.id = u."tenantId"
        JOIN public.plans p ON p.id = t."planId"
        WHERE u.period >= DATE_TRUNC('month', CURRENT_DATE)
        ORDER BY u."ordersCount" DESC
        LIMIT 10
      `;
      topTenants = usageData.map(d => ({
        businessName: d.businessName,
        slug: d.slug,
        status: d.status,
        plan: d.planName,
        orders: parseInt(d.orders) || 0,
        messages: parseInt(d.messages) || 0,
        aiCalls: parseInt(d.aiCalls) || 0,
      }));
    } catch {
      // usage_records table might be empty
    }

    // ─── Monthly signups (last 6 months) ───
    const monthlySignups: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const count = tenants.filter(t => {
        const d = new Date(t.createdAt);
        return d >= start && d < end;
      }).length;
      monthlySignups.push({
        month: start.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }),
        count,
      });
    }

    return {
      churnRate: Math.round(churnRate * 10) / 10,
      conversionRate: Math.round(conversionRate * 10) / 10,
      ltv: Math.round(ltv),
      growthRate: Math.round(growthRate * 10) / 10,
      mrr,
      newLast30Days: newLast30,
      totalTenants: tenants.length,
      activeTenants: totalPaid,
      trialTenants: tenants.filter(t => t.status === 'TRIAL').length,
      topTenants,
      monthlySignups,
    };
  }

  // ─── Broadcasts ───────────────────────────────────────────────

  async sendBroadcast(message: string, filter: 'all' | 'active' | 'trial' | 'suspended') {
    // Ensure broadcasts table exists
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.broadcasts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        message TEXT NOT NULL,
        filter VARCHAR(50) NOT NULL DEFAULT 'all',
        recipients_count INTEGER NOT NULL DEFAULT 0,
        sent_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get target tenants based on filter
    const statusFilter = filter === 'all'
      ? { in: ['ACTIVE', 'TRIAL', 'SUSPENDED'] as any[] }
      : filter === 'active'
        ? 'ACTIVE'
        : filter === 'trial'
          ? 'TRIAL'
          : 'SUSPENDED';

    const tenants = await this.prisma.tenant.findMany({
      where: { status: typeof statusFilter === 'string' ? statusFilter as any : { in: statusFilter.in } },
      select: { id: true, slug: true, schemaName: true, ownerEmail: true, businessName: true },
    });

    // Get phone numbers of tenant owners from their schemas
    let sentCount = 0;
    let failedCount = 0;

    // Use VSPRO's own WhatsApp channel to send broadcasts
    const vsproPlatformSchema = 'tenant_vspro';

    for (const tenant of tenants) {
      try {
        // Get owner's phone from customers table in vspro schema or from channel
        // We'll look for the tenant owner's phone in their own schema
        const phones = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT phone FROM "${tenant.schemaName}".users
          WHERE role = 'admin' AND phone IS NOT NULL
          LIMIT 1
        `).catch(() => []);

        // Alternatively look for the owner as a customer in VSPRO's schema
        if (!phones?.[0]?.phone) {
          const customers = await this.prisma.$queryRawUnsafe<any[]>(`
            SELECT channel_id FROM "${vsproPlatformSchema}".customers
            WHERE email = $1 OR name ILIKE $2
            LIMIT 1
          `, tenant.ownerEmail, `%${tenant.businessName}%`).catch(() => []);

          if (customers?.[0]?.channel_id) {
            const result = await this.messaging.sendText(
              customers[0].channel_id,
              message,
              'whatsapp',
              vsproPlatformSchema,
            );
            if (result.success) sentCount++;
            else failedCount++;
            continue;
          }
        }

        if (phones?.[0]?.phone) {
          const result = await this.messaging.sendText(
            phones[0].phone,
            message,
            'whatsapp',
            vsproPlatformSchema,
          );
          if (result.success) sentCount++;
          else failedCount++;
        } else {
          failedCount++;
        }
      } catch {
        failedCount++;
      }
    }

    // Save broadcast record
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO public.broadcasts (message, filter, recipients_count, sent_count, failed_count)
      VALUES ($1, $2, $3, $4, $5)
    `, message, filter, tenants.length, sentCount, failedCount);

    return {
      success: true,
      recipientsCount: tenants.length,
      sentCount,
      failedCount,
    };
  }

  async getBroadcastHistory() {
    try {
      const broadcasts = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT id, message, filter, recipients_count AS "recipientsCount",
               sent_count AS "sentCount", failed_count AS "failedCount",
               created_at AS "createdAt"
        FROM public.broadcasts
        ORDER BY created_at DESC
        LIMIT 50
      `);
      return broadcasts;
    } catch {
      return [];
    }
  }
}
