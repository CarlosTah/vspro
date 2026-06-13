# Billing y Gestión de Planes

## Flujo de Suscripción con Stripe

```
Usuario se registra
      ↓
Trial 14 días (sin tarjeta)
      ↓
Al día 10 → email "Tu trial termina en 4 días"
      ↓
Al día 14 → email "Activa tu suscripción"
      ↓
Usuario ingresa tarjeta → Stripe crea Customer + Subscription
      ↓
Stripe cobra mensualmente → webhook confirma pago
      ↓
Si pago falla → 3 reintentos automáticos (días 1, 3, 7)
      ↓
Si sigue fallando → tenant pasa a "suspended"
      ↓
Cliente paga deuda → tenant se reactiva automáticamente
```

---

## Módulo de Billing

```typescript
// modules/billing/billing.service.ts

@Injectable()
export class BillingService {

  // Crear suscripción cuando el tenant activa su plan
  async createSubscription(
    tenantId: string,
    planId: string,
    paymentMethodId: string,
  ): Promise<Subscription> {

    const tenant = await this.tenantsRepo.findById(tenantId);
    const plan = await this.plansRepo.findById(planId);

    // Crear o recuperar Customer en Stripe
    let stripeCustomerId = tenant.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await this.stripe.customers.create({
        email: tenant.ownerEmail,
        name: tenant.businessName,
        metadata: { tenantId, tenantSlug: tenant.slug }
      });
      stripeCustomerId = customer.id;
      await this.tenantsRepo.update(tenantId, { stripeCustomerId });
    }

    // Adjuntar método de pago
    await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: stripeCustomerId
    });

    // Crear suscripción
    const stripeSub = await this.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: plan.stripePriceId }],
      default_payment_method: paymentMethodId,
      trial_end: tenant.trialEndsAt
        ? Math.floor(tenant.trialEndsAt.getTime() / 1000)
        : undefined,
      metadata: { tenantId, planId }
    });

    // Guardar en BD local
    return await this.subscriptionsRepo.create({
      tenantId,
      planId,
      stripeSubId: stripeSub.id,
      status: stripeSub.status,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
    });
  }

  // Cambiar de plan (upgrade/downgrade)
  async changePlan(tenantId: string, newPlanId: string): Promise<void> {
    const subscription = await this.subscriptionsRepo.findByTenant(tenantId);
    const newPlan = await this.plansRepo.findById(newPlanId);

    // Actualizar en Stripe (prorratea automáticamente)
    await this.stripe.subscriptions.update(subscription.stripeSubId, {
      items: [{
        id: (await this.stripe.subscriptions.retrieve(subscription.stripeSubId))
          .items.data[0].id,
        price: newPlan.stripePriceId,
      }],
      proration_behavior: 'create_prorations',
    });

    // Actualizar en BD
    await this.subscriptionsRepo.update(subscription.id, { planId: newPlanId });
    await this.tenantsRepo.update(tenantId, { planId: newPlanId });
  }
}
```

---

## Webhooks de Stripe

```typescript
// modules/billing/stripe-webhook.controller.ts

@Controller('webhooks/stripe')
export class StripeWebhookController {

  @Post()
  @HttpCode(200)
  async handleStripeWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('stripe-signature') signature: string,
  ) {
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionCancelled(event.data.object);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
    }

    return { received: true };
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const tenantId = invoice.metadata.tenantId;

    // Contar intentos fallidos
    const failedAttempts = invoice.attempt_count;

    if (failedAttempts >= 3) {
      // Suspender tenant
      await this.tenantsRepo.update(tenantId, { status: 'suspended' });

      // Notificar al dueño
      await this.emailService.sendPaymentFailedFinal(
        (await this.tenantsRepo.findById(tenantId)).ownerEmail
      );
    } else {
      // Notificar intento fallido
      await this.emailService.sendPaymentFailed(
        (await this.tenantsRepo.findById(tenantId)).ownerEmail,
        failedAttempts
      );
    }
  }
}
```

---

## Control de Quotas en Tiempo Real

```typescript
// common/interceptors/usage-tracker.interceptor.ts

@Injectable()
export class UsageTrackerInterceptor implements NestInterceptor {

  async intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const tenant = request.tenant;
    const usageType = this.reflector.get<string>('track_usage', context.getHandler());

    if (!usageType || !tenant) {
      return next.handle();
    }

    // Verificar quota ANTES de ejecutar
    const canProceed = await this.quotaService.checkAndIncrement(
      tenant.id,
      usageType
    );

    if (!canProceed) {
      throw new ForbiddenException({
        code: 'QUOTA_EXCEEDED',
        message: `Has alcanzado el límite de tu plan para ${usageType}`,
        upgradeUrl: 'https://app.vspro.app/billing/upgrade'
      });
    }

    return next.handle();
  }
}

// modules/billing/quota.service.ts
@Injectable()
export class QuotaService {

  async checkAndIncrement(tenantId: string, type: string): Promise<boolean> {
    const period = startOfMonth(new Date()).toISOString().split('T')[0];

    // Obtener uso actual (con Redis para velocidad)
    const cacheKey = `quota:${tenantId}:${type}:${period}`;
    let currentUsage = await this.redis.get(cacheKey);

    if (!currentUsage) {
      // Cargar desde BD si no está en caché
      const record = await this.usageRepo.findByTenantAndPeriod(tenantId, period);
      currentUsage = String(record?.[type] || 0);
      await this.redis.setex(cacheKey, 3600, currentUsage);
    }

    const tenant = await this.tenantsRepo.findById(tenantId);
    const limit = tenant.plan.features[`max_${type}`];

    if (limit && parseInt(currentUsage) >= limit) {
      return false; // quota excedida
    }

    // Incrementar en Redis y BD
    await this.redis.incr(cacheKey);
    await this.usageRepo.increment(tenantId, period, type);

    // Alerta al 80%
    if (limit && parseInt(currentUsage) + 1 >= limit * 0.8) {
      await this.notifyQuotaWarning(tenantId, type, parseInt(currentUsage) + 1, limit);
    }

    return true;
  }
}
```
