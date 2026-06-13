# VSPRO — Plan de Pruebas E2E

> Documento vivo. Se actualiza conforme se ejecutan las pruebas.
> Fecha inicio: 2026-05-20

## Credenciales

| Tenant | Email | Password | Slug |
|--------|-------|----------|------|
| Vikids | admin@vikids.mx | Vikids2026! | vikids |
| Room 359 | admin@room359.mx | Room359!2026 | room359 |

## URLs

- Frontend: http://localhost:3000
- API: http://localhost:3001
- Swagger: http://localhost:3001/docs
- PostgreSQL: localhost:5433
- Redis: localhost:6380

---

## 1. HEALTH & INFRAESTRUCTURA

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 1.1 | Health check API | GET /health | status: ok, db: up | ⏳ | |
| 1.2 | Swagger accesible | GET /docs | HTML 200 | ⏳ | |
| 1.3 | Frontend carga | GET localhost:3000 | HTML 200 | ⏳ | |
| 1.4 | Redis conectado | Health check incluye redis | up | ⏳ | |

---

## 2. AUTENTICACIÓN

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 2.1 | Login vikids | POST /auth/login | accessToken + user | ⏳ | |
| 2.2 | Login room359 | POST /auth/login | accessToken + user | ⏳ | |
| 2.3 | Login con password incorrecto | POST /auth/login | 401 Unauthorized | ⏳ | |
| 2.4 | Login con tenant inexistente | POST /auth/login | 401/404 | ⏳ | |
| 2.5 | Acceso sin token | GET /products (sin Bearer) | 401 | ⏳ | |
| 2.6 | Token de un tenant en otro | vikids token + room359 slug | 401 | ⏳ | |

---

## 3. PRODUCTOS (vikids)

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 3.1 | Listar productos | GET /products | Array con 10 items | ⏳ | |
| 3.2 | Buscar producto | GET /products/search?q=vestido | Filtrado correcto | ⏳ | |
| 3.3 | Detalle producto | GET /products/:id | Objeto con variantes | ⏳ | |
| 3.4 | Crear producto | POST /products | 201 + nuevo producto | ⏳ | |
| 3.5 | Actualizar producto | PATCH /products/:id | Campos actualizados | ⏳ | |
| 3.6 | Actualizar stock | PATCH /products/:id/stock | Stock modificado | ⏳ | |
| 3.7 | Eliminar producto | DELETE /products/:id | 200/204 | ⏳ | |
| 3.8 | Listar variantes | GET /products/:productId/variants | Array variantes | ⏳ | |
| 3.9 | Crear variante | POST /products/variants | 201 | ⏳ | |

---

## 4. PRODUCTOS / PROPIEDADES (room359)

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 4.1 | Listar propiedades | GET /products | 6 propiedades | ⏳ | |
| 4.2 | Detalle con tarifas JSONB | GET /products/:id | custom_rates presente | ⏳ | |
| 4.3 | Buscar por categoría | GET /products/search?q=2 Recámaras | Filtrado | ⏳ | |

---

## 5. CLIENTES

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 5.1 | Listar clientes vikids | GET /customers | 5 clientes | ⏳ | |
| 5.2 | Listar clientes room359 | GET /customers | 4 clientes | ⏳ | |
| 5.3 | Detalle cliente | GET /customers/:id | Datos completos | ⏳ | |
| 5.4 | Pedidos de cliente | GET /customers/:id/orders | Array pedidos | ⏳ | |
| 5.5 | Crear cliente | POST /customers | 201 | ⏳ | |
| 5.6 | Actualizar cliente | PATCH /customers/:id | Campos actualizados | ⏳ | |

---

## 6. PEDIDOS (vikids)

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 6.1 | Listar pedidos | GET /orders | 8 pedidos | ⏳ | |
| 6.2 | Detalle pedido | GET /orders/:id | Items + customer | ⏳ | |
| 6.3 | Crear pedido | POST /orders | 201 + nuevo pedido | ⏳ | |
| 6.4 | Generar cotización | POST /orders/:id/quote | PDF/link cotización | ⏳ | |
| 6.5 | Solicitar pago | POST /orders/:id/request-payment | Estado actualizado | ⏳ | |
| 6.6 | Verificar pago | POST /orders/:id/verify-payment | Pago confirmado | ⏳ | |
| 6.7 | Iniciar producción | POST /orders/:id/start-production | Estado PRODUCTION | ⏳ | |
| 6.8 | Marcar listo | POST /orders/:id/mark-ready | Estado READY | ⏳ | |
| 6.9 | Enviar | POST /orders/:id/ship | Estado SHIPPED | ⏳ | |
| 6.10 | Entregar | POST /orders/:id/deliver | Estado DELIVERED | ⏳ | |
| 6.11 | Cancelar pedido | POST /orders/:id/cancel | Estado CANCELLED | ⏳ | |

---

## 7. RENTAL (room359)

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 7.1 | Check availability (libre) | POST /rental/check-availability | available: true + precio | ⏳ | |
| 7.2 | Check availability (bloqueado) | POST /rental/check-availability | available: false | ⏳ | |
| 7.3 | Crear reservación | POST /rental/reservations | 201 + reserva | ⏳ | |
| 7.4 | Calendario propiedad | GET /rental/calendar/:productId | Fechas bloqueadas | ⏳ | |
| 7.5 | Precio por semana | POST check-availability (7 noches) | Tarifa semanal | ⏳ | |
| 7.6 | Precio por mes | POST check-availability (30 noches) | Tarifa mensual | ⏳ | |

---

## 8. CONVERSACIONES

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 8.1 | Listar conversaciones | GET /conversations | 3 conversaciones | ⏳ | |
| 8.2 | Detalle conversación | GET /conversations/:id | Mensajes incluidos | ⏳ | |
| 8.3 | Mensajes de conversación | GET /conversations/:id/messages | Array mensajes | ⏳ | |
| 8.4 | Resolver conversación | POST /conversations/:id/resolve | Status resolved | ⏳ | |

---

## 9. PAGOS

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 9.1 | Pagos de un pedido | GET /payments/order/:orderId | Array pagos | ⏳ | |
| 9.2 | Verificar pago manual | POST /payments/verify-manual | Pago verificado | ⏳ | |
| 9.3 | Rechazar pago | PATCH /payments/:id/reject | Pago rechazado | ⏳ | |

---

## 10. PRODUCCIÓN

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 10.1 | Cola de producción | GET /production/queue | Pedidos en producción | ⏳ | |
| 10.2 | Pedidos listos | GET /production/ready | Pedidos terminados | ⏳ | |
| 10.3 | Stats producción | GET /production/stats | Métricas | ⏳ | |

---

## 11. LOGÍSTICA (vikids)

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 11.1 | Zonas de envío | GET /logistics/zones | 3 zonas | ⏳ | |
| 11.2 | Calcular envío | POST /logistics/calculate | Costo calculado | ⏳ | |
| 11.3 | Aplicar tarifa a pedido | POST /logistics/orders/:id/apply-rate | Tarifa aplicada | ⏳ | |

---

## 12. AI / HERRAMIENTAS

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 12.1 | Config IA vikids | GET /ai/config | assistantName: Viki | ⏳ | |
| 12.2 | Config IA room359 | GET /ai/config | assistantName: Luna | ⏳ | |
| 12.3 | Tools vikids | GET /ai/tools | 7 herramientas | ⏳ | |
| 12.4 | Tools room359 | GET /ai/tools | 8 herramientas | ⏳ | |
| 12.5 | Actualizar config IA | PATCH /ai/config | Config actualizada | ⏳ | |
| 12.6 | Registrar nueva tool | POST /ai/tools | Tool agregada | ⏳ | |
| 12.7 | Test chat (si OpenAI key válida) | POST /ai/test-chat | Respuesta IA | ⏳ | |

---

## 13. BILLING / SUSCRIPCIONES

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 13.1 | Ver suscripción | GET /billing/subscription | Plan actual | ⏳ | |
| 13.2 | Ver uso | GET /billing/usage | Métricas de uso | ⏳ | |
| 13.3 | Checkout (modo simulado) | POST /billing/checkout | URL o simulación | ⏳ | |

---

## 14. ENVÍOS (SHIPMENTS)

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 14.1 | Envíos de pedido | GET /shipments/order/:orderId | Array envíos | ⏳ | |
| 14.2 | Crear envío | POST /shipments | 201 | ⏳ | |
| 14.3 | Actualizar status envío | PATCH /shipments/:id/status | Status actualizado | ⏳ | |

---

## 15. STORAGE

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 15.1 | Obtener URL de upload | POST /storage/upload-url | URL presignada (o simulada) | ⏳ | |

---

## 16. CANALES (WhatsApp/Messenger)

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 16.1 | Listar canales | GET /channels | Array canales | ⏳ | |
| 16.2 | Crear canal | POST /channels | 201 | ⏳ | |
| 16.3 | Detalle canal | GET /channels/:id | Objeto canal | ⏳ | |
| 16.4 | Actualizar canal | PATCH /channels/:id | Actualizado | ⏳ | |
| 16.5 | Test canal | POST /channels/:id/test | Resultado test | ⏳ | |

---

## 17. FACTURACIÓN (INVOICING)

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 17.1 | Crear factura | POST /invoicing | Factura (modo simulado) | ⏳ | |
| 17.2 | Facturas de pedido | GET /invoicing/order/:orderId | Array facturas | ⏳ | |
| 17.3 | Resumen facturación | GET /invoicing/summary | Totales | ⏳ | |

---

## 18. SUPER ADMIN

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 18.1 | Stats plataforma | GET /super-admin/stats | MRR, tenants, uso | ⏳ | |
| 18.2 | Listar tenants | GET /super-admin/tenants | Array tenants | ⏳ | |
| 18.3 | Detalle tenant | GET /super-admin/tenants/:id | Info completa | ⏳ | |
| 18.4 | Impersonar tenant | POST /super-admin/tenants/:id/impersonate | Token | ⏳ | |
| 18.5 | Suspender tenant | POST /super-admin/tenants/:id/suspend | Status SUSPENDED | ⏳ | |
| 18.6 | Reactivar tenant | POST /super-admin/tenants/:id/reactivate | Status ACTIVE | ⏳ | |

---

## 19. WEBHOOKS

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 19.1 | Verificación Meta webhook | GET /webhooks/meta/:slug?hub.verify_token=... | Challenge echo | ⏳ | |
| 19.2 | Recibir mensaje Meta | POST /webhooks/meta/:slug | 200 + encolado | ⏳ | |

---

## 20. ONBOARDING (Registro nuevo tenant)

| # | Prueba | Método | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 20.1 | Check slug disponible | GET /tenants/check-slug?slug=nuevo | available: true | ⏳ | |
| 20.2 | Check slug ocupado | GET /tenants/check-slug?slug=vikids | available: false | ⏳ | |
| 20.3 | Registro completo | POST /tenants/onboarding | Tenant creado | ⏳ | |

---

## 21. FRONTEND (Navegador)

| # | Prueba | Página | Esperado | Resultado | Notas |
|---|--------|--------|----------|-----------|-------|
| 21.1 | Login page carga | /login | Logo + form visible | ⏳ | |
| 21.2 | Login exitoso vikids | /login → / | Redirect a dashboard | ⏳ | |
| 21.3 | Dashboard carga | / | Stats + sidebar | ⏳ | |
| 21.4 | Productos lista | /products | Tabla con 10 items | ⏳ | |
| 21.5 | Pedidos lista | /orders | Tabla con 8 pedidos | ⏳ | |
| 21.6 | Clientes lista | /customers | Tabla con 5 clientes | ⏳ | |
| 21.7 | Conversaciones | /conversations | 3 conversaciones | ⏳ | |
| 21.8 | Pagos | /payments | Lista pagos | ⏳ | |
| 21.9 | Producción | /production | Cola producción | ⏳ | |
| 21.10 | Configuración | /settings | Panel config | ⏳ | |
| 21.11 | Onboarding | /onboarding | Wizard 3 pasos | ⏳ | |
| 21.12 | Super Admin | /super-admin | Panel admin | ⏳ | |

---

## RESUMEN DE HALLAZGOS

| Severidad | Descripción | Módulo | Estado |
|-----------|-------------|--------|--------|
| — | — | — | — |

---

## NOTAS DE EJECUCIÓN

- **Prerequisitos**: Docker Desktop corriendo, `npm install` ejecutado
- **Levantar**: `docker compose up -d postgres redis` → `node --require @swc-node/register apps/api/src/main.ts` (desde apps/api) → `npx next dev --port 3000` (desde apps/web)
- **Comando rápido API**: `cd apps/api && node --require @swc-node/register src/main.ts`
