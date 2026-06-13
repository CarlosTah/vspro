# Fase 0 — Estrategia de Testing

## Pirámide de Tests para SaaS Multi-Tenant

```
                    ▲
                   /E2E\          ← Pocos, lentos, validan flujos completos
                  /──────\
                 / Smoke  \       ← Post-deploy, validan que el sistema vive
                /──────────\
               / Integration\     ← Módulos con BD/Redis reales
              /──────────────\
             / Tenant Isolation\  ← Críticos: ningún tenant ve datos de otro
            /──────────────────\
           /     Unit Tests      \ ← Muchos, rápidos, sin dependencias externas
          /──────────────────────\
```

---

## 1. Unit Tests

Prueban lógica pura sin tocar base de datos ni servicios externos.
Todo lo externo se mockea.

```typescript
// apps/api/src/modules/ai/__tests__/ai-engine.service.spec.ts

describe('AiEngineService', () => {

  describe('buildSystemPrompt', () => {
    it('incluye el nombre del asistente configurado por el tenant', () => {
      const config = { assistantName: 'Lupita', tone: 'friendly' } as AiConfig;
      const tenant = { businessName: 'Tortillería Don José' } as Tenant;

      const prompt = service.buildSystemPrompt(tenant, config, []);

      expect(prompt).toContain('Lupita');
      expect(prompt).toContain('Tortillería Don José');
    });

    it('incluye el catálogo de productos en el prompt', () => {
      const products = [
        { name: 'Tortilla de maíz', price: 25, description: '1kg' },
        { name: 'Tortilla de harina', price: 30, description: '1kg' },
      ] as Product[];

      const prompt = service.buildSystemPrompt(mockTenant, mockConfig, products);

      expect(prompt).toContain('Tortilla de maíz');
      expect(prompt).toContain('$25');
    });
  });

  describe('handleToolCalls', () => {
    it('llama a ordersService.create cuando la IA invoca create_order', async () => {
      const mockResponse = buildMockOpenAIResponse({
        tool_calls: [{
          function: {
            name: 'create_order',
            arguments: JSON.stringify({
              items: [{ product_id: 'prod-1', quantity: 2 }]
            })
          }
        }]
      });

      await service.handleToolCalls(mockTenant, mockResponse, mockConversation);

      expect(ordersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ items: expect.any(Array) }),
        mockTenant.schemaName
      );
    });
  });
});
```

```typescript
// apps/api/src/modules/payments/__tests__/payment-verification.service.spec.ts

describe('PaymentVerificationService', () => {

  describe('verifyTransferProof', () => {
    it('verifica automáticamente cuando el monto coincide exactamente', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(
        buildOcrResponse({ amount: 350.00, reference: 'REF123' })
      );
      mockOrdersService.findById.mockResolvedValue(
        buildOrder({ total: 350.00 })
      );

      const result = await service.verifyTransferProof(
        'https://s3.../comprobante.jpg',
        'order-id-1',
        'tenant_abc123'
      );

      expect(result.verified).toBe(true);
      expect(ordersService.updateStatus).toHaveBeenCalledWith(
        'order-id-1', 'payment_verified', 'tenant_abc123'
      );
    });

    it('rechaza cuando el monto difiere en más de $1', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(
        buildOcrResponse({ amount: 300.00 })
      );
      mockOrdersService.findById.mockResolvedValue(
        buildOrder({ total: 350.00 })
      );

      const result = await service.verifyTransferProof(
        'https://s3.../comprobante.jpg',
        'order-id-1',
        'tenant_abc123'
      );

      expect(result.verified).toBe(false);
      expect(ordersService.updateStatus).not.toHaveBeenCalled();
    });

    it('acepta diferencia de hasta $1 por redondeos bancarios', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(
        buildOcrResponse({ amount: 349.50 })
      );
      mockOrdersService.findById.mockResolvedValue(
        buildOrder({ total: 350.00 })
      );

      const result = await service.verifyTransferProof(
        'https://s3.../comprobante.jpg',
        'order-id-1',
        'tenant_abc123'
      );

      expect(result.verified).toBe(true);
    });
  });
});
```

---

## 2. Tenant Isolation Tests (los más críticos del sistema)

Estos tests verifican que **ningún tenant puede ver, modificar o afectar datos de otro**.
Son la red de seguridad más importante del SaaS.

```typescript
// apps/api/src/__tests__/tenant-isolation.spec.ts

describe('Tenant Isolation — CRÍTICO', () => {
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    // Crear dos tenants reales en la BD de test
    tenantA = await TestHelper.provisionTenant({
      slug: 'tenant-a-test',
      businessName: 'Empresa A'
    });
    tenantB = await TestHelper.provisionTenant({
      slug: 'tenant-b-test',
      businessName: 'Empresa B'
    });

    // Crear datos en cada tenant
    await TestHelper.seedTenantData(tenantA);
    await TestHelper.seedTenantData(tenantB);
  });

  afterAll(async () => {
    await TestHelper.destroyTenant(tenantA);
    await TestHelper.destroyTenant(tenantB);
  });

  // ── Pedidos ──────────────────────────────────────────────────────

  it('un usuario de Tenant A no puede ver pedidos de Tenant B', async () => {
    const tokenA = await TestHelper.getAuthToken(tenantA);
    const orderFromB = await TestHelper.getFirstOrder(tenantB);

    const response = await request(app.getHttpServer())
      .get(`/orders/${orderFromB.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Host', `${tenantA.slug}.vspro.app`);

    expect(response.status).toBe(404); // no 403, para no revelar que existe
  });

  it('un usuario de Tenant A no puede listar pedidos de Tenant B', async () => {
    const tokenA = await TestHelper.getAuthToken(tenantA);
    const ordersB = await TestHelper.getAllOrders(tenantB);

    const response = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Host', `${tenantA.slug}.vspro.app`);

    expect(response.status).toBe(200);
    const returnedIds = response.body.data.map((o: any) => o.id);

    // Ningún pedido de B debe aparecer en la respuesta de A
    ordersB.forEach(orderB => {
      expect(returnedIds).not.toContain(orderB.id);
    });
  });

  // ── Clientes ─────────────────────────────────────────────────────

  it('un usuario de Tenant A no puede acceder a clientes de Tenant B', async () => {
    const tokenA = await TestHelper.getAuthToken(tenantA);
    const customerFromB = await TestHelper.getFirstCustomer(tenantB);

    const response = await request(app.getHttpServer())
      .get(`/customers/${customerFromB.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Host', `${tenantA.slug}.vspro.app`);

    expect(response.status).toBe(404);
  });

  // ── Productos ─────────────────────────────────────────────────────

  it('modificar un producto de Tenant A no afecta a Tenant B', async () => {
    const tokenA = await TestHelper.getAuthToken(tenantA);
    const productA = await TestHelper.getFirstProduct(tenantA);
    const productBBefore = await TestHelper.getFirstProduct(tenantB);

    await request(app.getHttpServer())
      .patch(`/products/${productA.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Host', `${tenantA.slug}.vspro.app`)
      .send({ price: 9999 });

    const productBAfter = await TestHelper.getFirstProduct(tenantB);
    expect(productBAfter.price).toBe(productBBefore.price); // sin cambios
  });

  // ── Webhooks ──────────────────────────────────────────────────────

  it('un webhook dirigido a Tenant A no procesa mensajes en Tenant B', async () => {
    const webhookPayload = TestHelper.buildWhatsAppWebhook({
      from: '5215512345678',
      text: 'Hola, quiero hacer un pedido'
    });

    await request(app.getHttpServer())
      .post(`/webhooks/meta/${tenantA.slug}`)
      .send(webhookPayload);

    // Esperar procesamiento asíncrono
    await TestHelper.waitForQueue('messages');

    const conversationsA = await TestHelper.getConversations(tenantA);
    const conversationsB = await TestHelper.getConversations(tenantB);

    expect(conversationsA.length).toBe(1);
    expect(conversationsB.length).toBe(0); // Tenant B no debe tener nada
  });

  // ── Inyección de Tenant en Headers ───────────────────────────────

  it('no se puede suplantar un tenant manipulando headers', async () => {
    const tokenA = await TestHelper.getAuthToken(tenantA);
    const orderFromB = await TestHelper.getFirstOrder(tenantB);

    // Intento de acceder con token de A pero header apuntando a B
    const response = await request(app.getHttpServer())
      .get(`/orders/${orderFromB.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Host', `${tenantB.slug}.vspro.app`) // host de B, token de A
      .set('x-tenant-slug', tenantB.slug);       // header manipulado

    // El JWT de A no es válido para el schema de B
    expect(response.status).toBe(403);
  });

  // ── Quota de un tenant no afecta a otro ──────────────────────────

  it('agotar la quota de Tenant A no bloquea a Tenant B', async () => {
    // Llevar a Tenant A al límite de su plan
    await TestHelper.exhaustQuota(tenantA, 'orders');

    const tokenA = await TestHelper.getAuthToken(tenantA);
    const tokenB = await TestHelper.getAuthToken(tenantB);

    // Tenant A debe estar bloqueado
    const responseA = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Host', `${tenantA.slug}.vspro.app`)
      .send(TestHelper.buildOrderPayload());

    expect(responseA.status).toBe(403);
    expect(responseA.body.code).toBe('QUOTA_EXCEEDED');

    // Tenant B debe seguir funcionando normalmente
    const responseB = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('Host', `${tenantB.slug}.vspro.app`)
      .send(TestHelper.buildOrderPayload());

    expect(responseB.status).toBe(201);
  });
});
```

---

## 3. Integration Tests

Prueban módulos completos con PostgreSQL y Redis reales, pero sin llamadas externas (Meta API, OpenAI se mockean).

```typescript
// apps/api/src/modules/orders/__tests__/orders.integration.spec.ts

describe('Orders Module — Integration', () => {
  let tenant: TestTenant;

  beforeAll(async () => {
    tenant = await TestHelper.provisionTenant({ slug: 'orders-test' });
    await TestHelper.seedProducts(tenant, 5);
  });

  it('crea un pedido y reserva stock automáticamente', async () => {
    const product = await TestHelper.getFirstProduct(tenant);
    const stockBefore = await TestHelper.getStock(tenant, product.id);

    const token = await TestHelper.getAuthToken(tenant);
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Host', `${tenant.slug}.vspro.app`)
      .send({
        customerId: (await TestHelper.getFirstCustomer(tenant)).id,
        items: [{ productId: product.id, quantity: 2 }]
      });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('new');

    const stockAfter = await TestHelper.getStock(tenant, product.id);
    expect(stockAfter.reserved).toBe(stockBefore.reserved + 2);
    expect(stockAfter.available).toBe(stockBefore.available - 2);
  });

  it('el flujo completo de estados funciona en orden correcto', async () => {
    const order = await TestHelper.createOrder(tenant);
    const token = await TestHelper.getAuthToken(tenant);

    const transitions = [
      { action: 'quote', expectedStatus: 'quoted' },
      { action: 'request-payment', expectedStatus: 'payment_pending' },
      { action: 'verify-payment', expectedStatus: 'payment_verified' },
      { action: 'start-production', expectedStatus: 'in_production' },
      { action: 'mark-ready', expectedStatus: 'ready' },
      { action: 'ship', expectedStatus: 'shipped' },
    ];

    for (const { action, expectedStatus } of transitions) {
      const res = await request(app.getHttpServer())
        .post(`/orders/${order.id}/${action}`)
        .set('Authorization', `Bearer ${token}`)
        .set('Host', `${tenant.slug}.vspro.app`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(expectedStatus);
    }
  });

  it('no permite transiciones de estado inválidas', async () => {
    const order = await TestHelper.createOrder(tenant); // status: 'new'
    const token = await TestHelper.getAuthToken(tenant);

    // No se puede marcar como 'shipped' desde 'new'
    const response = await request(app.getHttpServer())
      .post(`/orders/${order.id}/ship`)
      .set('Authorization', `Bearer ${token}`)
      .set('Host', `${tenant.slug}.vspro.app`);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('INVALID_STATE_TRANSITION');
  });
});
```

---

## 4. Smoke Tests (post-deploy)

Se ejecutan contra el entorno real (staging o producción) después de cada deploy.
Son rápidos (< 60 segundos) y validan que el sistema está vivo y funcional.

```typescript
// apps/api/src/__tests__/smoke.spec.ts

const BASE_URL = process.env.SMOKE_BASE_URL; // staging o producción
const TENANT_TOKEN = process.env.SMOKE_TENANT_TOKEN;
const TENANT_HOST = process.env.SMOKE_TENANT_HOST;

describe('Smoke Tests — Post Deploy', () => {

  it('el API responde en /health', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
    expect(body.redis).toBe('connected');
  });

  it('la autenticación funciona', async () => {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${TENANT_TOKEN}`,
        Host: TENANT_HOST,
      }
    });
    expect(res.status).toBe(200);
  });

  it('el catálogo de productos responde', async () => {
    const res = await fetch(`${BASE_URL}/products`, {
      headers: {
        Authorization: `Bearer ${TENANT_TOKEN}`,
        Host: TENANT_HOST,
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('el webhook de Meta responde correctamente a verificación', async () => {
    const tenantSlug = process.env.SMOKE_TENANT_SLUG;
    const verifyToken = process.env.SMOKE_VERIFY_TOKEN;
    const challenge = 'smoke_test_challenge_12345';

    const res = await fetch(
      `${BASE_URL}/webhooks/meta/${tenantSlug}?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challenge}`
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe(challenge);
  });

  it('el health check de la cola de mensajes está activo', async () => {
    const res = await fetch(`${BASE_URL}/health/queues`, {
      headers: { Authorization: `Bearer ${TENANT_TOKEN}` }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages_queue).toBe('active');
  });
});
```

---

## 5. Health Check Endpoint

```typescript
// apps/api/src/modules/health/health.controller.ts

@Controller('health')
export class HealthController {

  @Get()
  @SkipAuth() // endpoint público
  async check(): Promise<HealthStatus> {
    const [dbOk, redisOk, queueOk] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkQueue(),
    ]);

    const status = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || 'unknown',
      db: dbOk.status === 'fulfilled' ? 'connected' : 'error',
      redis: redisOk.status === 'fulfilled' ? 'connected' : 'error',
      queue: queueOk.status === 'fulfilled' ? 'active' : 'error',
    };

    const allHealthy = Object.values(status)
      .filter(v => v === 'error').length === 0;

    if (!allHealthy) {
      status.status = 'degraded';
    }

    return status;
  }

  private async checkDatabase(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private async checkRedis(): Promise<void> {
    await this.redis.ping();
  }

  private async checkQueue(): Promise<void> {
    const queue = this.bullMQ.getQueue('messages');
    await queue.getJobCounts(); // lanza si Redis no responde
  }
}
```

---

## Configuración de Scripts en package.json

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --testPathPattern='__tests__/.*\\.spec\\.ts$' --testPathIgnorePatterns='integration|isolation|smoke'",
    "test:integration": "jest --testPathPattern='integration\\.spec\\.ts$'",
    "test:isolation": "jest --testPathPattern='tenant-isolation\\.spec\\.ts$'",
    "test:smoke": "jest --testPathPattern='smoke\\.spec\\.ts$' --runInBand",
    "test:all": "jest --runInBand",
    "test:coverage": "jest --coverage",
    "db:migrate:test": "DATABASE_URL=$TEST_DATABASE_URL prisma migrate deploy",
    "lint": "eslint 'apps/**/*.ts' 'packages/**/*.ts'",
    "typecheck": "tsc --noEmit",
    "format:check": "prettier --check 'apps/**/*.ts' 'packages/**/*.ts'"
  }
}
```

---

## Resumen: Qué se prueba y cuándo

| Test | Cuándo corre | Tiempo aprox. | Bloquea merge |
|------|-------------|---------------|---------------|
| Lint + typecheck | En cada PR | < 2 min | ✅ Sí |
| Unit tests | En cada PR | < 3 min | ✅ Sí |
| Integration tests | En cada PR | < 5 min | ✅ Sí |
| Tenant isolation | En cada PR | < 4 min | ✅ Sí |
| Smoke tests staging | Post-deploy staging | < 1 min | ✅ Sí (bloquea prod) |
| Smoke tests prod | Post-deploy prod | < 1 min | Rollback automático |

**Tiempo total de pipeline:** ~15 minutos de PR a producción si todo está verde.
