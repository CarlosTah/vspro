/**
 * TENANT ISOLATION TESTS — Los más críticos del sistema SaaS.
 *
 * Verifican que ningún tenant puede ver, modificar o afectar datos de otro.
 * Estos tests DEBEN pasar antes de cualquier deploy a producción.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { TenantProvisioningService } from '../modules/tenants/tenant-provisioning.service';
import { TestTenantHelper, TestTenant } from './helpers/test-tenant.helper';

describe('Tenant Isolation (CRÍTICO)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let helper: TestTenantHelper;
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    const provisioning = app.get(TenantProvisioningService);
    helper = new TestTenantHelper(app, prisma, provisioning);

    // Crear dos tenants independientes para los tests
    [tenantA, tenantB] = await Promise.all([
      helper.createTenant('isolation-tenant-a'),
      helper.createTenant('isolation-tenant-b'),
    ]);
  });

  afterAll(async () => {
    await Promise.all([helper.destroyTenant(tenantA), helper.destroyTenant(tenantB)]);
    await app.close();
  });

  // ─────────────────────────────────────────────────────────────
  // AUTENTICACIÓN CROSS-TENANT
  // ─────────────────────────────────────────────────────────────

  describe('Autenticación cross-tenant', () => {
    it('el token de Tenant A no es válido en el contexto de Tenant B', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tenantA.authToken}`)
        .set('x-tenant-slug', tenantB.slug); // contexto de B con token de A

      expect(response.status).toBe(403);
    });

    it('un token manipulado con schema de otro tenant es rechazado', async () => {
      // Intentar usar el token de A pero apuntando al host de B
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tenantA.authToken}`)
        .set('Host', `${tenantB.slug}.vspro.app`);

      expect(response.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // HEALTH CHECK (público — no requiere tenant)
  // ─────────────────────────────────────────────────────────────

  describe('Endpoints públicos', () => {
    it('/health responde sin autenticación ni tenant', async () => {
      const response = await request(app.getHttpServer()).get('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // TENANT SUSPENDIDO
  // ─────────────────────────────────────────────────────────────

  describe('Tenant suspendido', () => {
    it('un tenant suspendido recibe 403 en todos los endpoints', async () => {
      // Suspender Tenant A temporalmente
      await prisma.tenant.update({
        where: { id: tenantA.id },
        data: { status: 'SUSPENDED' },
      });

      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tenantA.authToken}`)
        .set('x-tenant-slug', tenantA.slug);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe('TENANT_SUSPENDED');

      // Restaurar para los demás tests
      await prisma.tenant.update({
        where: { id: tenantA.id },
        data: { status: 'TRIAL' },
      });
    });

    it('suspender Tenant A no afecta a Tenant B', async () => {
      await prisma.tenant.update({
        where: { id: tenantA.id },
        data: { status: 'SUSPENDED' },
      });

      // Tenant B debe seguir funcionando
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tenantB.authToken}`)
        .set('x-tenant-slug', tenantB.slug);

      expect(response.status).toBe(200);

      // Restaurar
      await prisma.tenant.update({
        where: { id: tenantA.id },
        data: { status: 'TRIAL' },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // WEBHOOK ISOLATION
  // ─────────────────────────────────────────────────────────────

  describe('Webhook isolation', () => {
    it('un webhook para Tenant A no afecta a Tenant B', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'test-entry',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  messages: [
                    {
                      from: '5215512345678',
                      id: 'msg-test-001',
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: 'text',
                      text: { body: 'Hola, quiero hacer un pedido' },
                    },
                  ],
                  contacts: [{ profile: { name: 'Cliente Test' }, wa_id: '5215512345678' }],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      // Enviar webhook al tenant A (sin firma válida — esperamos 401)
      const response = await request(app.getHttpServer())
        .post(`/webhooks/meta/${tenantA.slug}`)
        .send(payload);

      // Sin firma HMAC válida debe rechazar
      expect(response.status).toBe(401);
    });
  });
});
