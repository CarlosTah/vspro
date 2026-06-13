import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get('STRIPE_SECRET_KEY');
    this.stripe = key && !key.startsWith('sk_test_not')
      ? new Stripe(key)
      : null;

    if (!this.stripe) {
      this.logger.warn('STRIPE_SECRET_KEY no configurada — billing en modo simulado');
    }
  }

  // ─── Checkout: crear sesión de pago para suscripción ─────────

  async createCheckoutSession(
    tenantId: string,
    planSlug: string,
    interval: 'monthly' | 'yearly' = 'monthly',
  ) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    const plan = await this.prisma.plan.findFirstOrThrow({
      where: { slug: planSlug, isActive: true },
    });

    const priceId = interval === 'yearly'
      ? plan.stripePriceIdYearly
      : plan.stripePriceIdMonthly;

    if (!this.stripe) {
      // Modo simulado — retorna URL fake
      return {
        url: `http://localhost:3000/billing/success?session_id=sim_${Date.now()}`,
        sessionId: `sim_${Date.now()}`,
        mode: 'simulated',
      };
    }

    if (!priceId) {
      throw new BadRequestException(
        `El plan '${planSlug}' no tiene precio de Stripe configurado para intervalo '${interval}'`,
      );
    }

    // Crear o recuperar Stripe Customer
    let stripeCustomerId = tenant.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        email: tenant.ownerEmail,
        name: tenant.businessName,
        metadata: { tenantId: tenant.id, tenantSlug: tenant.slug },
      });
      stripeCustomerId = customer.id;
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { stripeCustomerId },
      });
    }

    // Crear Checkout Session
    const session = await this.stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.config.get('APP_URL', 'http://localhost:3000')}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.config.get('APP_URL', 'http://localhost:3000')}/billing/cancel`,
      metadata: { tenantId: tenant.id, planSlug },
      subscription_data: {
        metadata: { tenantId: tenant.id, planSlug },
      },
    });

    return { url: session.url, sessionId: session.id };
  }

  // ─── Portal: sesión para que el tenant gestione su suscripción ─

  async createPortalSession(tenantId: string, returnUrl?: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });

    if (!this.stripe) {
      return { url: returnUrl ?? 'http://localhost:3000/settings', mode: 'simulated' };
    }

    if (!tenant.stripeCustomerId) {
      throw new BadRequestException('Este tenant no tiene suscripción activa en Stripe');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: returnUrl ?? `${this.config.get('APP_URL', 'http://localhost:3000')}/settings`,
    });

    return { url: session.url };
  }

  // ─── Info de suscripción actual ───────────────────────────────

  async getSubscriptionInfo(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { plan: true, subscription: true },
    });

    return {
      plan: {
        name: tenant.plan.name,
        slug: tenant.plan.slug,
        priceMonthly: tenant.plan.priceMonthly,
      },
      subscription: tenant.subscription
        ? {
            status: tenant.subscription.status,
            currentPeriodEnd: tenant.subscription.currentPeriodEnd,
          }
        : null,
      tenant: {
        status: tenant.status,
        trialEndsAt: tenant.trialEndsAt,
      },
    };
  }

  // ─── Webhooks de Stripe ───────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!this.stripe) {
      this.logger.warn('Webhook recibido pero Stripe no está configurado');
      return { received: true, mode: 'simulated' };
    }

    const webhookSecret = this.config.getOrThrow('STRIPE_WEBHOOK_SECRET');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      this.logger.error(`Firma de webhook Stripe inválida: ${err.message}`);
      throw new BadRequestException('Firma de webhook inválida');
    }

    this.logger.log(`Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        this.logger.debug(`Evento no manejado: ${event.type}`);
    }

    return { received: true };
  }

  // ─── Handlers de eventos ──────────────────────────────────────

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const tenantId = session.metadata?.tenantId;
    const planSlug = session.metadata?.planSlug;

    if (!tenantId || !planSlug) {
      this.logger.warn('Checkout sin metadata de tenant');
      return;
    }

    const plan = await this.prisma.plan.findFirst({ where: { slug: planSlug } });
    if (!plan) return;

    // Activar tenant
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE', planId: plan.id },
    });

    // Actualizar suscripción
    await this.prisma.subscription.upsert({
      where: { tenantId },
      update: {
        planId: plan.id,
        stripeSubId: session.subscription as string,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
      },
      create: {
        tenantId,
        planId: plan.id,
        stripeSubId: session.subscription as string,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
      },
    });

    this.logger.log(`Tenant ${tenantId} activado con plan ${planSlug}`);
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice) {
    const tenantId = invoice.subscription_details?.metadata?.tenantId
      ?? invoice.metadata?.tenantId;

    if (!tenantId) return;

    // Renovar período
    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: invoice.period_start
          ? new Date(invoice.period_start * 1000)
          : undefined,
        currentPeriodEnd: invoice.period_end
          ? new Date(invoice.period_end * 1000)
          : undefined,
      },
    });

    // Asegurar que el tenant está activo
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE' },
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const tenantId = invoice.subscription_details?.metadata?.tenantId
      ?? invoice.metadata?.tenantId;

    if (!tenantId) return;

    const attemptCount = invoice.attempt_count ?? 0;

    if (attemptCount >= 3) {
      // Suspender después de 3 intentos fallidos
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'SUSPENDED' },
      });
      await this.prisma.subscription.updateMany({
        where: { tenantId },
        data: { status: 'PAST_DUE' },
      });
      this.logger.warn(`Tenant ${tenantId} SUSPENDIDO por falta de pago (${attemptCount} intentos)`);
    } else {
      await this.prisma.subscription.updateMany({
        where: { tenantId },
        data: { status: 'PAST_DUE' },
      });
      this.logger.warn(`Pago fallido para tenant ${tenantId} (intento ${attemptCount})`);
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) return;

    const status = this.mapStripeStatus(subscription.status);
    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: {
        status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      },
    });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) return;

    await this.prisma.subscription.updateMany({
      where: { tenantId },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'CANCELLED' },
    });

    this.logger.log(`Suscripción cancelada para tenant ${tenantId}`);
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'UNPAID' {
    const map: Record<string, 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'UNPAID'> = {
      active: 'ACTIVE',
      trialing: 'TRIALING',
      past_due: 'PAST_DUE',
      canceled: 'CANCELLED',
      unpaid: 'UNPAID',
    };
    return map[status] ?? 'ACTIVE';
  }
}
