# VSPRO — Documentación Técnica

## Índice

| # | Documento | Descripción |
|---|-----------|-------------|
| **F0** | [**Fase 0 — Hardening CI/CD**](./00-fase-0-hardening.md) | Pipeline completo: lint → unit → integration → isolation → staging → prod |
| **F0** | [**Fase 0 — Estrategia de Testing**](./00-fase-0-hardening-tests.md) | Unit, integration, tenant isolation, smoke tests con código real |
| **F0** | [**Fase 0 — Staging Tenant**](./00-fase-0-staging-tenant.md) | Qué es, cómo se seed, diferencias con producción, checklist |
| **F0** | [**Fase 0 — Implementación ✅**](./08-fase-0-implementacion.md) | Registro de lo construido: monorepo, BD, API, isolation verificado |
| **F1** | [**Fase 1 — Schema del Tenant ✅**](./09-fase-1-schema-tenant.md) | 12 tablas de negocio, índices, provisioning automático |
| **F1** | [**Fase 1 — Módulos de Negocio ✅**](./10-fase-1-modulos-negocio.md) | Products, Customers, Orders, Payments, Conversations, IA, Webhooks |
| 01 | [Visión General](./01-vision-general.md) | Stack tecnológico, estructura del monorepo |
| 02 | [Multi-Tenant](./02-multi-tenant.md) | Arquitectura de datos, middleware, provisioning |
| 03 | [Módulos API](./03-modulos-api.md) | NestJS modules, IA engine, pagos OCR, producción |
| 04 | [Mensajería](./04-mensajeria-adaptador.md) | Adaptadores WhatsApp/Messenger/Instagram, flujo de mensajes |
| 05 | [Billing](./05-billing-planes.md) | Stripe, quotas, planes, suspensión automática |
| 06 | [Infraestructura](./06-infraestructura.md) | Docker, AWS, CI/CD, seguridad, monitoreo |
| 07 | [Plan de Implementación](./07-plan-implementacion.md) | Fases, equipo, riesgos, decisiones técnicas |

---

## Resumen Ejecutivo

**VSPRO** es un SaaS multi-tenant que permite a PYMEs recibir y gestionar pedidos
a través de WhatsApp, Messenger e Instagram, con automatización completa del flujo:
pedido → pago → producción → envío → contabilidad.

### Stack Principal
- **Backend**: NestJS (TypeScript) + PostgreSQL 16 + Redis
- **Frontend**: Next.js 14 + shadcn/ui
- **IA**: OpenAI GPT-4o (NLP + Vision)
- **Mensajería**: Meta Cloud API (WhatsApp + Messenger + Instagram)
- **Billing**: Stripe Billing
- **Infra**: AWS (ECS + RDS + ElastiCache + S3)

### Arquitectura Clave
- **Multi-tenancy**: Schema por tenant en PostgreSQL (aislamiento real)
- **Mensajería**: Patrón Strategy con adaptador unificado
- **IA**: GPT-4o con Function Calling para acciones del negocio
- **Asincronía**: BullMQ para procesamiento de mensajes sin bloquear webhooks

### Timeline
- **Fase 1** (12 semanas): MVP — WhatsApp + IA + pedidos + billing
- **Fase 2** (10 semanas): Producto completo — todos los canales + inventario + envíos
- **Fase 3** (8 semanas): Escala — integraciones + white-label + API pública
