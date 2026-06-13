# Fase 0 — El Staging Tenant

## Qué es y por qué importa

El "Staging Tenant" es un tenant permanente en el entorno de staging que replica
exactamente el estado de un cliente real en producción.

No es un tenant vacío. Tiene:
- Productos con precios reales
- Clientes con historial de conversaciones
- Pedidos en todos los estados posibles
- Pagos verificados y pendientes
- Configuración de IA activa
- Canales de WhatsApp/Messenger conectados (con números de prueba de Meta)

Cada deploy a staging se prueba contra este tenant antes de tocar producción.

---

## Estructura del Staging Tenant

```
Tenant: "VSPRO Demo Store" (slug: vspro-demo)
├── Canales conectados
│   ├── WhatsApp: número de prueba de Meta Sandbox
│   ├── Messenger: página de Facebook de prueba
│   └── Instagram: cuenta de prueba
│
├── Catálogo (20 productos)
│   ├── 5 productos con stock alto
│   ├── 5 productos con stock bajo (< mínimo)
│   ├── 5 productos sin stock
│   └── 5 productos inactivos
│
├── Clientes (10 clientes)
│   ├── Cliente con historial largo de conversaciones
│   ├── Cliente con pedido en cada estado
│   └── Cliente nuevo sin historial
│
├── Pedidos (1 en cada estado)
│   ├── new, quoted, payment_pending
│   ├── payment_verified, in_production
│   ├── ready, shipped, delivered
│   └── cancelled
│
└── Configuración IA
    ├── Asistente: "Demo Bot"
    ├── Tono: casual
    └── Horario: 24/7 (para no bloquear tests)
```

---

## Script de Seed del Staging Tenant

```typescript
// scripts/seed-staging-tenant.ts
// Se ejecuta una vez al crear el entorno de staging
// y se puede re-ejecutar para resetear el estado

import { PrismaClient } from '@prisma/client';
import { TenantProvisioningService } from '../apps/api/src/modules/tenants';

async function seedStagingTenant() {
  const provisioning = new TenantProvisioningService(prisma);

  // 1. Crear o resetear el tenant de staging
  const tenant = await provisioning.provisionNewTenant({
    slug: 'vspro-demo',
    businessName: 'VSPRO Demo Store',
    email: 'demo@vspro.app',
    planId: PRO_PLAN_ID, // plan profesional para probar todas las features
  });

  const schema = tenant.schemaName;

  // 2. Configurar IA
  await prisma.$executeRaw`
    INSERT INTO ${schema}.ai_config
      (assistant_name, tone, welcome_message, language)
    VALUES
      ('Demo Bot', 'casual', '¡Hola! Soy Demo Bot, ¿en qué te ayudo?', 'es')
  `;

  // 3. Crear productos representativos
  const products = await seedProducts(schema);

  // 4. Crear clientes
  const customers = await seedCustomers(schema);

  // 5. Crear pedidos en todos los estados
  await seedOrdersAllStates(schema, customers, products);

  // 6. Crear conversaciones con historial
  await seedConversations(schema, customers);

  console.log(`✅ Staging tenant listo: ${tenant.slug}`);
  console.log(`   Schema: ${schema}`);
  console.log(`   Panel: https://vspro-demo.staging.vspro.app`);
}

async function seedProducts(schema: string) {
  const products = [
    { sku: 'PROD-001', name: 'Producto A', price: 150.00, stock: 100 },
    { sku: 'PROD-002', name: 'Producto B', price: 250.00, stock: 50 },
    { sku: 'PROD-003', name: 'Producto C', price: 75.00, stock: 3 },   // stock bajo
    { sku: 'PROD-004', name: 'Producto D', price: 500.00, stock: 0 },  // sin stock
    { sku: 'PROD-005', name: 'Producto E', price: 99.00, stock: 200, isActive: false }, // inactivo
  ];

  // INSERT en el schema del tenant...
  return products;
}

async function seedOrdersAllStates(schema, customers, products) {
  const states = [
    'new', 'quoted', 'payment_pending',
    'payment_verified', 'in_production',
    'ready', 'shipped', 'delivered', 'cancelled'
  ];

  for (const status of states) {
    await createOrderWithStatus(schema, status, customers[0], products[0]);
  }
}
```

---

## Reset del Staging Tenant

Antes de cada suite de integration tests en staging, el tenant se resetea
a un estado conocido para garantizar reproducibilidad:

```typescript
// apps/api/src/__tests__/helpers/staging-reset.ts

export async function resetStagingTenant(): Promise<void> {
  // Solo disponible en entorno de staging
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NUNCA resetear en producción');
  }

  const response = await fetch(
    `${process.env.STAGING_URL}/internal/reset-demo-tenant`,
    {
      method: 'POST',
      headers: {
        'x-internal-key': process.env.INTERNAL_RESET_KEY,
      }
    }
  );

  if (!response.ok) {
    throw new Error('No se pudo resetear el staging tenant');
  }
}
```

```typescript
// apps/api/src/modules/internal/internal.controller.ts
// Solo disponible en staging, bloqueado en producción

@Controller('internal')
@UseGuards(InternalKeyGuard)
export class InternalController {

  @Post('reset-demo-tenant')
  async resetDemoTenant() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('No disponible en producción');
    }

    await this.stagingService.resetDemoTenant();
    return { reset: true, timestamp: new Date().toISOString() };
  }
}
```

---

## Diferencias entre Staging y Producción

| Aspecto | Staging | Producción |
|---------|---------|------------|
| Infraestructura | Idéntica (misma config ECS/RDS) | — |
| Versión PostgreSQL | Idéntica | — |
| Variables de entorno | Mismas claves, valores de prueba | Valores reales |
| WhatsApp | Meta Sandbox (números de prueba) | Números reales aprobados |
| OpenAI | Misma API, cuota separada | — |
| Stripe | Modo test (tarjetas de prueba) | Modo live |
| Emails | Interceptados (no llegan a usuarios reales) | Envío real |
| Datos | Seed controlado + datos de prueba | Datos reales de clientes |
| Backups | Diarios (retención 7 días) | Diarios (retención 30 días) |
| Monitoreo | Grafana staging | Grafana producción + alertas PagerDuty |

---

## Checklist de la Fase 0

### Infraestructura
- [ ] Entorno de staging en AWS (ECS + RDS + ElastiCache) idéntico a producción
- [ ] Variables de entorno de staging configuradas en GitHub Secrets
- [ ] Docker images construyéndose correctamente
- [ ] Migraciones de Prisma corriendo en staging sin errores
- [ ] Nginx configurado con subdominios wildcard (`*.staging.vspro.app`)
- [ ] SSL válido para staging

### CI/CD
- [ ] GitHub Actions pipeline completo (lint → unit → integration → isolation → staging → prod)
- [ ] Branch protection rules en `main` configuradas
- [ ] Aprobación manual requerida para deploy a producción
- [ ] Rollback automático funcionando (probado manualmente)
- [ ] Notificaciones a Slack configuradas

### Testing
- [ ] Suite de unit tests con > 80% de cobertura en módulos críticos
- [ ] Suite de integration tests cubriendo flujos principales
- [ ] Suite de tenant isolation tests cubriendo todos los recursos
- [ ] Smoke tests corriendo post-deploy en staging y producción
- [ ] Health check endpoint respondiendo correctamente

### Staging Tenant
- [ ] Tenant "vspro-demo" provisionado con datos representativos
- [ ] Canales de Meta conectados con números/páginas de prueba
- [ ] Endpoint de reset funcionando
- [ ] Panel admin accesible en `vspro-demo.staging.vspro.app`

### Observabilidad
- [ ] Logs centralizados (Loki o CloudWatch)
- [ ] Métricas básicas en Grafana (latencia, errores, uso de BD)
- [ ] Sentry configurado para captura de errores
- [ ] Alertas de uptime configuradas (Betteruptime)

**Esta fase está completa cuando un PR puede ir de código a producción
en ~15 minutos, completamente automatizado, con rollback automático si algo falla.**
