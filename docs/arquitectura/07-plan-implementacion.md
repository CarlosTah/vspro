# Plan de Implementación

## Fases de Desarrollo

```
FASE 1 ──────── FASE 2 ──────── FASE 3 ──────── FASE 4
Semanas 1-12    Semanas 13-22   Semanas 23-30   Ongoing
Core SaaS       Producto        Escala          Crecimiento
```

---

## Fase 1 — Core SaaS (12 semanas)

### Semanas 1-2: Fundación
- [ ] Monorepo con Turborepo (apps/api, apps/web, packages/)
- [ ] Docker Compose para desarrollo local
- [ ] PostgreSQL con extensión pgvector
- [ ] Redis + BullMQ configurado
- [ ] Prisma schema inicial (tablas públicas: tenants, plans, subscriptions)
- [ ] CI/CD básico con GitHub Actions

### Semanas 3-4: Multi-Tenancy
- [ ] Middleware de resolución de tenant por subdominio
- [ ] Servicio de provisioning (crear schema + migraciones por tenant)
- [ ] Prisma schema del tenant (users, products, orders, etc.)
- [ ] Guards de autenticación JWT multi-tenant
- [ ] Tests de aislamiento de datos entre tenants

### Semanas 5-6: Autenticación y Onboarding
- [ ] Registro de nueva PYME (crea tenant + usuario admin)
- [ ] Login / logout / refresh token
- [ ] Wizard de onboarding (7 pasos)
- [ ] Conexión de WhatsApp Business (guía + verificación)
- [ ] Carga de catálogo básico (manual + CSV)

### Semanas 7-8: Motor de IA + WhatsApp
- [ ] Adaptador WhatsApp (Meta Cloud API)
- [ ] Webhook receiver + verificación HMAC
- [ ] Cola BullMQ para procesamiento asíncrono
- [ ] AiEngineService con GPT-4o + function calling
- [ ] Herramientas: check_availability, create_order, get_order_status
- [ ] Búsqueda semántica de productos con pgvector

### Semanas 9-10: Pedidos y Pagos
- [ ] CRUD completo de pedidos
- [ ] Flujo de estados del pedido
- [ ] Verificación de comprobantes con GPT-4o Vision
- [ ] Notificaciones automáticas al cliente por WhatsApp
- [ ] Módulo de producción (cola + notificación de listo)

### Semanas 11-12: Billing y Panel Admin
- [ ] Integración Stripe (suscripciones + webhooks)
- [ ] Trial de 14 días automático
- [ ] Panel admin básico (Next.js): dashboard, pedidos, conversaciones
- [ ] Sistema de quotas y límites por plan
- [ ] Emails transaccionales (bienvenida, pago, suspensión)

**Entregable Fase 1:** MVP funcional con WhatsApp + IA + pedidos + pagos + billing

---

## Fase 2 — Producto Completo (10 semanas)

### Semanas 13-14: Messenger + Instagram
- [ ] Adaptadores Messenger e Instagram
- [ ] Webhooks unificados para los 3 canales
- [ ] Tests de integración multi-canal

### Semanas 15-16: Inventario y Producción
- [ ] Módulo de inventario (stock, reservas, alertas)
- [ ] Panel de producción (cola, asignación, estados)
- [ ] Notificación automática al cliente cuando pedido está listo
- [ ] Flujo de confirmación de dirección de envío

### Semanas 17-18: Envíos
- [ ] Integración con al menos 2 paqueterías (FedEx + Estafeta)
- [ ] Generación de guías de envío
- [ ] Tracking automático + notificaciones al cliente
- [ ] Skydropx como agregador de paqueterías (opcional)

### Semanas 19-20: Contabilidad y Reportes
- [ ] Registro automático de ventas
- [ ] Integración Facturapi (CFDI 4.0 México)
- [ ] Reportes: ventas por período, canal, producto
- [ ] Exportación CSV/Excel
- [ ] Dashboard financiero en panel admin

### Semanas 21-22: Panel Super-Admin
- [ ] Vista de todos los tenants
- [ ] MRR, churn, conversiones en tiempo real
- [ ] Gestión de planes y precios
- [ ] Herramientas de soporte (ver conversaciones de un tenant)
- [ ] Logs de uso por tenant

**Entregable Fase 2:** Producto completo listo para lanzamiento comercial

---

## Fase 3 — Escala (8 semanas)

### Semanas 23-24: Integraciones Contables
- [ ] Conector CONTPAQi
- [ ] Conector Aspel SAE
- [ ] Conector QuickBooks Online
- [ ] Marketplace de integraciones en el panel

### Semanas 25-26: White-Label
- [ ] Dominio personalizado por tenant (CNAME)
- [ ] Personalización de colores y logo en el panel
- [ ] Emails con branding del tenant
- [ ] Asistente IA con nombre y avatar personalizado

### Semanas 27-28: API Pública
- [ ] REST API documentada (Swagger/OpenAPI)
- [ ] API Keys por tenant
- [ ] Webhooks salientes (el tenant puede recibir eventos en su sistema)
- [ ] SDK básico JavaScript/Python

### Semanas 29-30: Optimización y Escala
- [ ] Migración a Kubernetes (EKS)
- [ ] Auto-scaling de workers según carga
- [ ] Optimización de queries PostgreSQL (índices, particionado)
- [ ] Cache agresivo con Redis para catálogos y configuraciones
- [ ] Load testing (k6) y ajustes de performance

---

## Equipo Recomendado

| Rol | Fase 1 | Fase 2-3 |
|-----|--------|----------|
| Backend (NestJS) | 2 devs | 2-3 devs |
| Frontend (Next.js) | 1 dev | 1-2 devs |
| DevOps / Infra | 0.5 (part-time) | 1 dev |
| QA | 0.5 (part-time) | 1 dev |
| Product / Diseño | 1 | 1 |

**Total Fase 1:** 4-5 personas durante 12 semanas

---

## Decisiones Técnicas Clave

### ¿Por qué NestJS y no Express puro?
- Módulos, inyección de dependencias y decoradores reducen código boilerplate
- Soporte nativo para microservicios si se necesita escalar
- TypeScript de primera clase
- Ecosistema maduro para Guards, Interceptors, Pipes

### ¿Por qué schema-per-tenant y no base de datos separada?
- Base de datos separada por tenant es más costosa (cada RDS instance ~$15-50/mes)
- Schema por tenant: 1 instancia RDS, aislamiento real, backups individuales posibles
- Más fácil de operar con menos de 500 tenants
- Si se necesita más aislamiento en el futuro, se puede migrar

### ¿Por qué BullMQ y no SQS?
- BullMQ corre sobre Redis (ya lo tenemos para caché)
- Sin costo adicional de AWS SQS
- Dashboard visual (Bull Board) para monitorear jobs
- Migrar a SQS es sencillo si se necesita en el futuro

### ¿Por qué GPT-4o y no un modelo propio?
- Entrenar un modelo propio requiere datos y tiempo que no tenemos al inicio
- GPT-4o con function calling es suficientemente preciso para pedidos
- El costo es bajo (~$5-15/mes para volumen inicial)
- Se puede optimizar usando GPT-4o-mini para tareas simples y GPT-4o para complejas

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Meta cambia políticas de API | Media | Alto | Capa de abstracción, monitorear changelog de Meta |
| OpenAI sube precios | Baja | Medio | Diseño agnóstico de proveedor, soporte para Claude como alternativa |
| Tenant con datos corruptos afecta a otros | Baja | Alto | Aislamiento por schema, tests de cross-tenant |
| Pico de tráfico derrumba el sistema | Media | Alto | BullMQ absorbe picos, auto-scaling en ECS |
| Comprobante de pago fraudulento | Media | Medio | OCR + revisión manual para montos > umbral configurable |
