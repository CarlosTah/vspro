# VSPRO — Ruta de Pruebas Integral (Frontend)

> **Objetivo:** Validar cada módulo desde el navegador, documentando hallazgos.
> **Fecha:** 2026-05-21
> **URLs:** Frontend http://localhost:3000 | API http://localhost:3001 | Swagger http://localhost:3001/docs

---

## CREDENCIALES DE ACCESO

| Tenant | Slug | Email | Password | Giro |
|--------|------|-------|----------|------|
| **Vikids** | `vikids` | admin@vikids.mx | Vikids2026! | Ropa infantil niña |
| **Room 359** | `room359` | admin@room359.mx | Room359!2026 | Departamentos en renta |

---

## FASE 0: PREPARACIÓN

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 0.1 | Abrir navegador | Ir a http://localhost:3000 | Página de login con logo VSPRO | | |
| 0.2 | Verificar logo | Confirmar que aparece el logo + slogan "Inteligencia en movimiento. Escala sin límites." | Logo visible | | |
| 0.3 | Verificar API | Abrir http://localhost:3001/health en otra pestaña | `{"status":"ok"}` | | |
| 0.4 | Swagger | Abrir http://localhost:3001/docs | Documentación interactiva | | |

---

## FASE 1: LOGIN Y AUTENTICACIÓN

### 1A. Login Vikids

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 1.1 | Campo negocio | Escribir `vikids` en "Tu negocio" | Se muestra `vikids.vspro.app` | | |
| 1.2 | Credenciales | Email: `admin@vikids.mx`, Pass: `Vikids2026!` | Campos llenos | | |
| 1.3 | Submit | Click "Iniciar sesión" | Redirect a Dashboard `/` | | |
| 1.4 | Sidebar | Verificar sidebar con logo + navegación | Logo VSPRO + menú completo | | |
| 1.5 | Rol | Verificar indicador de rol en sidebar | "Rol: admin" | | |

### 1B. Login Room 359

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 1.6 | Logout | Cerrar sesión (si hay botón) o limpiar localStorage | Volver a /login | | |
| 1.7 | Login room359 | Slug: `room359`, Email: `admin@room359.mx`, Pass: `Room359!2026` | Redirect a Dashboard | | |
| 1.8 | Datos tenant | Verificar que muestra "Room 359 — Estancias Premium" | Nombre correcto | | |

### 1C. Validaciones negativas

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 1.9 | Password incorrecto | Intentar login con password `wrong123` | Error "Credenciales inválidas" | | |
| 1.10 | Tenant inexistente | Slug: `noexiste`, cualquier email/pass | Error de autenticación | | |

---

## FASE 2: DASHBOARD (Vikids)

> **Prerequisito:** Estar logueado como vikids

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 2.1 | Dashboard home | Navegar a `/` | Stats del negocio visibles | | |
| 2.2 | Métricas | Verificar que muestra pedidos, ingresos, clientes | Números > 0 | | |

---

## FASE 3: PRODUCTOS (Vikids — Ropa Infantil)

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 3.1 | Navegar | Click "Productos" en sidebar | Lista de productos | | |
| 3.2 | Conteo | Verificar que hay 10 productos | 10 items en tabla | | |
| 3.3 | Categorías | Verificar categorías: Vestidos, Conjuntos, Chamarras, etc. | Categorías visibles | | |
| 3.4 | Precios | Verificar que los precios están en MXN | Formato correcto | | |
| 3.5 | Stock | Verificar columna de stock disponible | Números > 0 | | |
| 3.6 | Buscar | Buscar "vestido" | Filtrar productos con "vestido" en nombre | | |
| 3.7 | Detalle | Click en un producto | Ver detalle con variantes (tallas/colores) | | |
| 3.8 | Crear producto | Click "Nuevo producto" → llenar: nombre "Blusa Test", SKU "TEST-BL-001", precio 199, categoría "Blusas" | Producto creado | | |
| 3.9 | Editar | Cambiar precio del producto test a 249 | Precio actualizado | | |
| 3.10 | Eliminar | Eliminar producto test | Producto removido de la lista | | |

---

## FASE 4: CLIENTES (Vikids)

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 4.1 | Navegar | Click "Clientes" en sidebar | Lista de 5 clientes | | |
| 4.2 | Datos | Verificar: nombre, teléfono, canal (WhatsApp) | Datos completos | | |
| 4.3 | Detalle | Click en "Valentina Herrera" | Ver perfil + historial | | |
| 4.4 | Pedidos del cliente | En detalle, ver pedidos asociados | Lista de pedidos | | |
| 4.5 | Crear cliente | Nuevo cliente: "María Test", tel: 5215500009999, canal: whatsapp | Cliente creado | | |

---

## FASE 5: PEDIDOS (Vikids — Flujo Completo)

### 5A. Listado y detalle

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 5.1 | Navegar | Click "Pedidos" en sidebar | Lista de 8 pedidos | | |
| 5.2 | Estados | Verificar que hay pedidos en diferentes estados | new, payment_pending, etc. | | |
| 5.3 | Detalle | Click en un pedido | Ver items, cliente, total, estado | | |

### 5B. Crear pedido nuevo

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 5.4 | Nuevo pedido | Click "Nuevo pedido" | Formulario de creación | | |
| 5.5 | Seleccionar cliente | Elegir "Valentina Herrera" | Cliente asignado | | |
| 5.6 | Agregar items | Agregar "Vestido Mariposas" x1 | Item en la lista | | |
| 5.7 | Confirmar | Guardar pedido | Pedido creado con número ORD-2026-XXXXX | | |

### 5C. Flujo de estados del pedido

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 5.8 | Solicitar pago | Botón "Solicitar pago" | Estado → payment_pending | | |
| 5.9 | Verificar pago | Simular verificación de pago | Estado → paid | | |
| 5.10 | Iniciar producción | Botón "Iniciar producción" | Estado → in_production | | |
| 5.11 | Marcar listo | Botón "Listo para envío" | Estado → ready | | |
| 5.12 | Enviar | Registrar envío | Estado → shipped | | |
| 5.13 | Entregar | Confirmar entrega | Estado → delivered | | |

---

## FASE 6: PAGOS (Vikids)

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 6.1 | Navegar | Click "Pagos" en sidebar | Lista de pagos | | |
| 6.2 | Ver pago | Click en un pago | Detalle: método, monto, estado | | |
| 6.3 | Verificar manual | Simular verificación de transferencia | Pago marcado como verificado | | |

---

## FASE 7: PRODUCCIÓN (Vikids)

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 7.1 | Navegar | Click "Producción" en sidebar | Cola de producción | | |
| 7.2 | Stats | Verificar estadísticas de producción | Métricas visibles | | |
| 7.3 | Cola | Ver pedidos en producción | Lista con estados | | |

---

## FASE 8: CONVERSACIONES (Vikids)

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 8.1 | Navegar | Click "Conversaciones" en sidebar | 3 conversaciones | | |
| 8.2 | Abrir | Click en una conversación | Ver historial de mensajes | | |
| 8.3 | Mensajes | Verificar mensajes inbound/outbound | Burbujas de chat | | |
| 8.4 | Resolver | Marcar conversación como resuelta | Estado → resolved | | |

---

## FASE 9: CONFIGURACIÓN (Vikids)

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 9.1 | Navegar | Click "Configuración" en sidebar | Panel de settings | | |
| 9.2 | IA Config | Ver configuración de IA | assistantName: "Viki" | | |
| 9.3 | Tools | Ver herramientas de IA | 7 tools + update_customer_memory + schedule_follow_up | | |
| 9.4 | Editar nombre | Cambiar nombre del asistente a "Viki Pro" | Guardado exitoso | | |
| 9.5 | Revertir | Volver a "Viki" | Guardado | | |

---

## FASE 10: RENTAL (Room 359 — Departamentos)

> **Prerequisito:** Logout de vikids, login como room359

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 10.1 | Login | Slug: `room359`, admin@room359.mx / Room359!2026 | Dashboard Room 359 | | |
| 10.2 | Productos | Navegar a Productos | 6 propiedades | | |
| 10.3 | Categorías | Verificar: 1 Recámara, 2 Recámaras, Estudios, Casas | Categorías correctas | | |
| 10.4 | Detalle propiedad | Click en "Depto 2 Recámaras Condesa" | Ver tarifas (noche/semana/mes) | | |
| 10.5 | Clientes | Navegar a Clientes | 4 clientes | | |
| 10.6 | Pedidos/Reservas | Navegar a Pedidos | Reservaciones existentes | | |

### 10B. Prueba de disponibilidad (via Swagger)

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 10.7 | Check disponibilidad | POST /rental/check-availability con fechas libres | available: true + precio | | |
| 10.8 | Precio por noche | 4 noches → precio = perNight × 4 | Cálculo correcto | | |
| 10.9 | Precio semanal | 7 noches → tarifa semanal aplicada | Descuento semanal | | |
| 10.10 | Crear reservación | POST /rental/reservations | Reserva creada | | |

---

## FASE 11: MEMORIA DE CLIENTE (IA)

> **Prerequisito:** Logueado como vikids

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 11.1 | Ver memoria | GET /customers/{id}/memory (Swagger) | profile + episodes | | |
| 11.2 | Guardar preferencia | PATCH /customers/{id}/memory/profile → `{"category":"preferences","data":{"color":"rosa"}}` | Profile actualizado | | |
| 11.3 | Guardar talla | PATCH → `{"category":"sizes","data":{"vestido":"6","zapatos":"22"}}` | Sizes guardados | | |
| 11.4 | Verificar merge | GET /customers/{id}/memory | preferences + sizes ambos presentes | | |
| 11.5 | Eliminar memoria | DELETE /customers/{id}/memory | Todo borrado | | |

---

## FASE 12: PROACTIVIDAD (Follow-ups)

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 12.1 | Ver follow-ups | GET /proactivity/follow-ups | Array (vacío si no hay programados) | | |
| 12.2 | Programar (via API) | Simular schedule_follow_up en una conversación | next_follow_up_at seteado | | |
| 12.3 | Verificar lista | GET /proactivity/follow-ups | Follow-up aparece en lista | | |
| 12.4 | Cancelar | DELETE /proactivity/follow-ups/{conversationId} | Follow-up eliminado | | |

---

## FASE 13: ONBOARDING (Registro nueva empresa)

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 13.1 | Navegar | Ir a http://localhost:3000/onboarding | Wizard de 3 pasos con logo | | |
| 13.2 | Paso 1 | Llenar: slug "test-empresa", nombre "Test Empresa SA", email "test@test.com", nombre "Carlos Test", password "Test2026!" | Validación OK | | |
| 13.3 | Paso 2 | Agregar producto: "Producto Demo", precio 100 | Producto en lista | | |
| 13.4 | Completar | Click "Registrar" | Tenant creado exitosamente | | |
| 13.5 | Login nuevo | Login con slug "test-empresa", test@test.com / Test2026! | Dashboard vacío | | |

---

## FASE 14: SUPER ADMIN

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 14.1 | Navegar | Ir a http://localhost:3000/super-admin | Panel con logo VSPRO | | |
| 14.2 | Stats | Verificar MRR, tenants activos, en trial | Números coherentes | | |
| 14.3 | Lista tenants | Ver tabla de tenants | vikids, room359, + otros | | |
| 14.4 | Impersonar | Click "Entrar" en vikids | Abre nueva pestaña con token | | |
| 14.5 | Suspender | Suspender un tenant de prueba | Estado → SUSPENDED | | |
| 14.6 | Reactivar | Reactivar el tenant | Estado → ACTIVE | | |

---

## FASE 15: AISLAMIENTO DE TENANT (Crítico)

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 15.1 | Cross-tenant | Logueado como vikids, intentar acceder datos de room359 | 401 Unauthorized | | |
| 15.2 | Productos aislados | Vikids ve 10 productos, room359 ve 6 | Datos separados | | |
| 15.3 | Clientes aislados | Vikids ve 5 clientes, room359 ve 4 | Sin mezcla | | |
| 15.4 | Memoria aislada | Memoria de vikids no visible desde room359 | Aislamiento OK | | |

---

## FASE 16: LOGÍSTICA Y ENVÍOS (Vikids)

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 16.1 | Zonas | GET /logistics/zones (Swagger) | 3 zonas: local, regional, nacional | | |
| 16.2 | Calcular | POST /logistics/calculate con datos de envío | Costo calculado | | |
| 16.3 | Crear envío | POST /shipments para un pedido | Envío registrado | | |
| 16.4 | Tracking | Verificar tracking number en detalle de pedido | Número visible | | |

---

## FASE 17: FACTURACIÓN (Vikids)

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 17.1 | Resumen | GET /invoicing/summary | Totales de facturación | | |
| 17.2 | Crear factura | POST /invoicing (modo simulado) | Factura generada | | |

---

## FASE 18: BILLING / SUSCRIPCIÓN

| # | Paso | Acción | Resultado esperado | ✓/✗ | Notas |
|---|------|--------|-------------------|------|-------|
| 18.1 | Ver plan | GET /billing/subscription | Plan "pro" activo | | |
| 18.2 | Ver uso | GET /billing/usage | Métricas de consumo | | |

---

## RESUMEN DE HALLAZGOS

| # | Severidad | Módulo | Descripción | Acción requerida |
|---|-----------|--------|-------------|-----------------|
| | | | | |
| | | | | |
| | | | | |

---

## NOTAS FINALES

### Orden recomendado de ejecución:
1. Fase 0 (preparación) → Fase 1 (login)
2. Fases 2-9 (vikids completo)
3. Fase 10 (room359 rental)
4. Fases 11-12 (IA: memoria + proactividad)
5. Fase 13 (onboarding nuevo tenant)
6. Fase 14 (super admin)
7. Fase 15 (aislamiento — CRÍTICO)
8. Fases 16-18 (logística, facturación, billing)

### Tips:
- Para pruebas de API directas, usa Swagger en http://localhost:3001/docs
- El header `x-tenant-slug` es requerido en todas las llamadas autenticadas
- Los tokens JWT expiran en 7 días
- Si la API se cae, reiniciar con: `cd apps/api && node --require @swc-node/register src/main.ts`
