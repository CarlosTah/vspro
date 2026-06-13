# SaaS Omnicanal para PYMEs — Diseño Técnico

## Nombre del Proyecto
**VSPRO** — Ventas & Servicio PRO (nombre sugerido, ajustable)

## Visión
Plataforma SaaS multi-tenant que permite a PYMEs recibir pedidos por WhatsApp, Messenger e Instagram, procesarlos con IA, y automatizar producción, inventario, cobros y envíos.

---

## Stack Tecnológico Definitivo

### Backend
- **Runtime**: Node.js 20 LTS
- **Framework**: NestJS (TypeScript) — modular, escalable, ideal para microservicios
- **ORM**: Prisma — type-safe, migraciones automáticas, soporte multi-schema
- **Base de datos principal**: PostgreSQL 16 (multi-schema por tenant)
- **Caché / Sesiones**: Redis 7
- **Cola de mensajes**: BullMQ (sobre Redis) para jobs asíncronos
- **WebSockets**: Socket.io para notificaciones en tiempo real al panel

### Frontend (Panel de Administración)
- **Framework**: Next.js 14 (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **Estado global**: Zustand
- **Gráficas**: Recharts
- **Formularios**: React Hook Form + Zod

### IA
- **NLP / Conversación**: OpenAI GPT-4o API
- **OCR / Visión**: GPT-4o Vision
- **Embeddings** (catálogo semántico): OpenAI text-embedding-3-small
- **Vector DB** (búsqueda de productos): pgvector (extensión PostgreSQL)

### Mensajería
- **WhatsApp**: Meta Cloud API (directo, sin BSP intermediario)
- **Messenger + Instagram**: Meta Graph API v19+
- **Abstracción**: Adaptador unificado interno (patrón Strategy)

### Infraestructura
- **Contenedores**: Docker + Docker Compose (dev) / Kubernetes (producción)
- **Cloud**: AWS (región us-east-1 + latam si aplica)
- **CI/CD**: GitHub Actions
- **Reverse proxy**: Nginx
- **SSL**: Let's Encrypt (Certbot)
- **Storage**: AWS S3 (imágenes, comprobantes, logos)
- **CDN**: CloudFront

### Billing
- **Principal**: Stripe Billing (suscripciones + webhooks)
- **LATAM alternativo**: MercadoPago Subscriptions
- **Facturación electrónica MX**: Facturapi (CFDI 4.0)

### Observabilidad
- **Logs**: Winston + Loki
- **Métricas**: Prometheus + Grafana
- **Errores**: Sentry
- **Uptime**: Betteruptime

---

## Repositorio — Estructura Monorepo

```
vspro/
├── apps/
│   ├── api/                    # Backend NestJS
│   ├── web/                    # Panel admin Next.js
│   └── worker/                 # Procesador de jobs BullMQ
├── packages/
│   ├── database/               # Prisma schema + migraciones
│   ├── shared/                 # Types, DTOs, constantes compartidas
│   ├── ai-engine/              # Lógica de IA centralizada
│   └── messaging/              # Adaptadores de canales
├── infrastructure/
│   ├── docker/
│   ├── kubernetes/
│   └── terraform/
├── docs/
│   └── arquitectura/
├── .github/
│   └── workflows/
├── docker-compose.yml
├── turbo.json                  # Turborepo para monorepo
└── package.json
```
