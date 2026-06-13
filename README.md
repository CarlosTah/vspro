# VSPRO — SaaS de Pedidos Omnicanal para PYMEs

Plataforma multi-tenant que permite a PYMEs recibir pedidos por WhatsApp, Messenger e Instagram,
con automatización completa: IA conversacional → pedido → pago → producción → envío → contabilidad.

## Requisitos

- Node.js 20+
- Docker & Docker Compose
- npm 10+

## Arranque rápido (desarrollo local)

### 1. Clonar y configurar variables de entorno

```bash
git clone https://github.com/tu-org/vspro.git
cd vspro
cp .env.example .env.local
# Editar .env.local con tus claves de OpenAI, Meta, Stripe, etc.
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Levantar infraestructura (PostgreSQL + Redis)

```bash
docker compose up postgres redis -d
```

### 4. Ejecutar migraciones y generar cliente Prisma

```bash
npm run db:generate
npm run db:migrate:dev
```

### 5. Levantar el API en modo desarrollo

```bash
npm run dev --workspace=@vspro/api
```

El API estará disponible en `http://localhost:3001`
Swagger en `http://localhost:3001/docs`

---

## Estructura del Monorepo

```
vspro/
├── apps/
│   ├── api/          # Backend NestJS (TypeScript)
│   └── worker/       # Procesador de jobs BullMQ (próximamente)
├── packages/
│   ├── database/     # Prisma schema + cliente
│   └── shared/       # Types, constantes compartidas
├── infrastructure/
│   └── docker/       # Configuración Docker
├── docs/
│   └── arquitectura/ # Documentación técnica completa
└── .github/
    └── workflows/    # CI/CD pipeline
```

---

## Tests

```bash
# Unit tests (sin dependencias externas)
npm run test:unit

# Integration tests (requiere PostgreSQL + Redis corriendo)
npm run test:integration

# Tenant isolation tests (CRÍTICOS — correr antes de cada deploy)
npm run test:isolation

# Smoke tests (contra staging o producción)
SMOKE_BASE_URL=https://api.staging.vspro.app npm run test:smoke
```

---

## CI/CD

El pipeline de GitHub Actions tiene 6 jobs en secuencia:

```
lint → unit tests → integration tests → tenant isolation → staging → producción
```

- Ningún PR se mergea sin que todos los jobs estén verdes
- El deploy a producción requiere aprobación manual
- Si el smoke test de producción falla → rollback automático

Ver `.github/workflows/ci.yml` para el pipeline completo.

---

## Documentación técnica

Ver `docs/arquitectura/` para el diseño técnico completo:

- `00-fase-0-hardening.md` — Pipeline CI/CD
- `00-fase-0-hardening-tests.md` — Estrategia de testing
- `00-fase-0-staging-tenant.md` — Staging tenant
- `01-vision-general.md` — Stack y estructura
- `02-multi-tenant.md` — Arquitectura multi-tenant
- `03-modulos-api.md` — Módulos NestJS
- `04-mensajeria-adaptador.md` — Adaptadores de canales
- `05-billing-planes.md` — Billing y planes
- `06-infraestructura.md` — Infraestructura AWS
- `07-plan-implementacion.md` — Fases de desarrollo
