# Fase 0 — Implementación: Registro de lo Construido

> Este documento registra lo que se implementó y verificó en la Fase 0.
> Complementa los documentos de diseño (00-fase-0-*.md) con el estado real del código.

---

## Estado: ✅ COMPLETADA

**Período:** Semanas 0-1  
**Objetivo:** Infraestructura base, monorepo, multi-tenancy y pipeline CI/CD operativos antes de escribir lógica de negocio.

---

## 1. Monorepo

### Estructura implementada

```
vspro/
├── apps/
│   └── api/                        # Backend NestJS — puerto 3001
├── packages/
│   ├── database/                   # Prisma schema + cliente
│   └── shared/                     # Types y constantes compartidas
├── infrastructure/
│   └── docker/postgres/init.sql    # Extensiones pgvector + uuid-ossp
├── .github/workflows/ci.yml        # Pipeline CI/CD completo
├── docker-compose.yml              # PostgreSQL 5433 + Redis 6380
├── turbo.json                      # Turborepo orchestration
├── tsconfig.base.json              # TypeScript base config
├── .env.example                    # Template de variables
└── .env.test                       # Variables para tests (commitable)
```

### Decisiones tomadas

**Turborepo** como orquestador del monorepo. Permite correr `typecheck`, `lint`, `test` en paralelo en los 3 packages con caché entre runs.

**Puertos locales no estándar** (`5433` para PostgreSQL, `6380` para Redis) para evitar conflictos con otros proyectos en la misma máquina de desarrollo.

**`tsconfig` por package** — cada package tiene su propio `tsconfig.json` con `-p tsconfig.json` explícito en los scripts. Sin esto, TypeScript escala hacia arriba y encuentra proyectos ajenos en carpetas hermanas.

---

## 2. Base de Datos

### Schema público (tablas globales)

Migración `20260505091939_init` aplicada. Tablas creadas:

| Tabla | Propósito |
|-------|-----------|
| `plans` | Planes de suscripción (Básico, Pro, Empresarial) |
| `tenants` | PYMEs registradas en la plataforma |
| `subscriptions` | Suscripción activa de cada tenant |
| `usage_records` | Uso mensual por tenant (para quotas) |
| `super_admins` | Administradores de VSPRO |
| `_prisma_migrations` | Control de migraciones de Prisma |

### Seed inicial

3 planes insertados:

| Plan | Precio/mes | Canales | Pedidos/mes |
|------|-----------|---------|-------------|
| Básico | $49 | WhatsApp | 200 |
| Profesional | $149 | WA + Messenger | 1,000 |
| Empresarial | $399 | WA + Messenger + Instagram | Ilimitados |

### Extensiones PostgreSQL habilitadas

- `pgvector` — búsqueda semántica de productos con embeddings
- `uuid-ossp` — generación de UUIDs con `gen_random_uuid()`

---

## 3. API NestJS

### Módulos implementados (funcionales)

| Módulo | Endpoints | Estado |
|--------|-----------|--------|
| `HealthModule` | `GET /health` | ✅ Funcional |
| `AuthModule` | `POST /auth/login`, `GET /auth/me` | ✅ Funcional |
| `TenantsModule` | `POST /tenants/register` | ✅ Funcional |
| `WebhooksModule` | `GET/POST /webhooks/meta/:slug` | ✅ Estructura lista |

### Módulos stub (estructura lista, lógica en Fase 1)

`OrdersModule`, `ProductsModule`, `CustomersModule`, `ConversationsModule`, `PaymentsModule`, `InventoryModule`, `ProductionModule`, `BillingModule`

### Componentes transversales implementados

**`TenantMiddleware`** — resuelve el tenant desde subdominio o header `x-tenant-slug` en cada request. Bloquea tenants suspendidos o cancelados con mensajes de error específicos.

**`JwtStrategy`** con `passReqToCallback: true` — valida que el tenant del JWT coincide con el tenant del request. Previene cross-tenant token reuse.

**`PlanFeatureGuard`** — verifica que el plan del tenant incluye la feature requerida. Retorna `403` con `upgradeUrl` si no.

**`TenantPrismaService`** — gestiona clientes Prisma por schema de tenant. Cachea los clientes para reutilizar el pool de conexiones.

---

## 4. Tenant Isolation — Verificación Manual

Pruebas ejecutadas contra el entorno local:

| # | Prueba | Esperado | Resultado |
|---|--------|----------|-----------|
| 1 | Token propio en su tenant | HTTP 200 | ✅ 200 |
| 2 | Token de Tenant A en contexto de Tenant B | HTTP 401/403 | ✅ 403 |
| 3 | Request sin token | HTTP 401 | ✅ 401 |
| 4 | Tenant suspendido intenta acceder | HTTP 403 | ✅ 403 |

### Bug encontrado y corregido

**Problema:** La firma de `validate()` en `JwtStrategy` estaba invertida. Con `passReqToCallback: true`, Passport llama `validate(req, payload)` — no `validate(payload, req)`. El error causaba que el objeto `request` se pasara como `tenantId` a Prisma, generando un error 500.

**Fix aplicado:** Corregir el orden de parámetros en `jwt.strategy.ts`:
```typescript
// ❌ Incorrecto
async validate(payload: JwtPayload, req: any)

// ✅ Correcto
async validate(req: any, payload: JwtPayload)
```

---

## 5. Pipeline CI/CD

Archivo: `.github/workflows/ci.yml`

### Jobs configurados

```
lint-and-typecheck  →  unit-tests  →  integration-tests
                    →  tenant-isolation-tests
                              ↓ (todos verdes)
                        deploy-staging
                              ↓ (smoke tests pasan)
                        deploy-production  ← requiere aprobación manual
```

### Características clave

- **Cancelación de runs anteriores** con `concurrency` — si se hace push mientras corre el pipeline, el run anterior se cancela
- **La imagen de staging se reutiliza en producción** — no se reconstruye, lo que se probó es exactamente lo que se despliega
- **Rollback automático** si el smoke test de producción falla
- **Notificaciones a Slack** en deploy exitoso y fallido

---

## 6. Comandos de Referencia

### Arranque diario (desarrollo local)

```bash
# 1. Levantar infraestructura
docker compose up postgres redis -d

# 2. Levantar API (en terminal separada o como proceso background)
DATABASE_URL="postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db" \
REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=vspro_redis_dev \
JWT_SECRET=vspro-dev-jwt-secret-min-32-characters \
NODE_ENV=development PORT=3001 \
npx ts-node -r tsconfig-paths/register --project apps/api/tsconfig.json apps/api/src/main.ts
```

### Cierre limpio

```bash
# Detener API (si corre como proceso background en Kiro)
# Detener Docker sin perder datos
docker compose stop
```

### Verificación rápida

```bash
curl http://localhost:3001/health
# → {"status":"ok","info":{"database":{"status":"up"},"memory_heap":{"status":"up"}}}
```

### Migraciones y seed

```bash
# Generar cliente Prisma
DATABASE_URL="postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db" \
  npx prisma generate --schema=packages/database/prisma/schema.prisma

# Aplicar migración
DATABASE_URL="postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db" \
  npx prisma migrate dev --schema=packages/database/prisma/schema.prisma

# Seed de planes
DATABASE_URL="postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db" \
  npx ts-node --compiler-options '{"module":"CommonJS"}' packages/database/prisma/seed.ts
```

---

## 7. Tenants de Desarrollo

Creados durante la Fase 0 para pruebas:

| Tenant | Slug | Schema | Email admin |
|--------|------|--------|-------------|
| Tortillería Don José | `tortilleria-don-jose` | `tenant_7r2anau` | jose@tortilleria.com |
| Panadería La Esperanza | `panaderia-la-esperanza` | `tenant_h16rnds` | admin@panaderia.com |
| Mueblería Hernández | `muebleria-hernandez` | (ver BD) | admin@muebleria.com |
| Ferretería López | `ferreteria-lopez` | (ver BD) | admin@ferreteria.com |
| Paletería Reyes | `paleteria-reyes` | `tenant_tj4xefb` | admin@paleteria.com |

Contraseña de todos los tenants de prueba: `Password123!` / `MiPassword123!`

> ⚠️ Estos tenants son solo para desarrollo local. No deben existir en staging ni producción.
