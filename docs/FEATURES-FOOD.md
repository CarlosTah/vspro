# VSPRO — Checklist de Funciones para Negocios de Comida

**Aplica a:** Taquerías, restaurantes, pizzerías, cafeterías, loncherías, cocinas económicas, dark kitchens, y cualquier negocio de venta de comida por pedido.

---

## Agente de IA (WhatsApp)

- [x] Toma pedidos por WhatsApp con lenguaje natural ("dame 3 de pastor sin piña y una coca")
- [x] Procesamiento de notas de voz (audio → texto → pedido)
- [x] Catálogo dinámico — el agente conoce productos, precios y disponibilidad
- [x] Upselling automático — sugiere complemento lógico después de confirmar pedido
- [x] Memoria de cliente — recuerda nombre, dirección, preferencias
- [x] Pedido habitual — "lo mismo de siempre" repite el último pedido
- [x] Envío de menú/fotos/promociones como imagen por WhatsApp
- [x] Encuesta post-entrega (1-5 estrellas) automática 5 min después de entrega
- [x] Bloqueo por horario — rechaza pedidos fuera del horario configurado
- [x] Detección de frustración y escalamiento a humano
- [x] Seguimientos proactivos (follow-ups programados)
- [x] Manejo de imágenes (comprobantes de pago, referencia de ubicación)
- [x] Knowledge base configurable (FAQ del negocio)

---

## Pedidos y Pagos

- [x] Flujo completo: nuevo → pago → producción → listo → enviado → entregado
- [x] Pago por transferencia (datos bancarios configurables, comprobante por foto)
- [x] Pago contra entrega (COD) — el repartidor cobra, pedido va directo a producción
- [x] Pago en efectivo/tarjeta en local
- [x] Verificación de pagos por OCR (foto del comprobante)
- [x] Número de pedido único auto-generado
- [x] Notas especiales por pedido ("sin cebolla", "bien dorado")
- [x] Historial de pedidos por cliente

---

## Delivery / Entregas

- [x] Costo de envío configurable (se suma automáticamente al total)
- [x] Dirección con calle, colonia, referencias + ubicación GPS de WhatsApp
- [x] Despacho automático a repartidores (cron cada 60s cuando pedido está listo)
- [x] Notificación al repartidor vía WhatsApp con datos del pedido + mapa
- [x] Sistema de aceptar/rechazar para repartidores (SI/NO por WhatsApp)
- [x] Timeout y reasignación si el repartidor no responde (configurable)
- [x] Info de COD para el repartidor ("COBRAR $XX al cliente")
- [x] Estados de entrega: ofrecido → aceptado → recogido → entregado
- [x] Notificación al cliente cuando el pedido sale ("tu pedido va en camino")

---

## Cocina / Producción

- [x] Vista de cocina (KDS) con pedidos en cola
- [x] Transición automática payment_verified → in_production
- [x] Marcar pedido como "listo" dispara notificación al cliente y al repartidor
- [x] Vista de producción con filtros por estado

---

## Catálogo y Stock

- [x] Productos con nombre, precio, categoría, imágenes, SKU
- [x] Inventario con stock disponible, reservado, mínimo
- [x] Auto-reposición de stock (negocios de comida hacen sobre demanda → stock 9999)
- [x] Búsqueda semántica de productos (pgvector embeddings)
- [x] Productos activos/inactivos

---

## Promociones y Combos

- [x] Combos (ej: "2 tacos + refresco por $89")
- [x] Descuentos por porcentaje o monto fijo
- [x] 2x1 / BOGO (compra X lleva Y gratis)
- [x] Paquetes (bundle con ahorro)
- [x] Reglas: días activos, fechas inicio/fin, límite de usos
- [x] El agente ofrece promos proactivamente cuando el pedido coincide
- [x] Aplicación automática de descuento al pedido

---

## Programa de Lealtad

- [x] Puntos por cada $1 gastado (configurable)
- [x] Niveles/Tiers (Bronce, Plata, Oro) con multiplicador de puntos
- [x] Acumulación automática al verificar pago
- [x] Recompensas canjeables (descuento fijo, %, producto gratis, envío gratis)
- [x] El agente consulta y canjea puntos por WhatsApp
- [x] Bono de bienvenida configurable
- [x] Leaderboard de clientes top
- [x] Re-engagement automático para clientes inactivos (7+ días sin pedir)

---

## Analytics y Reportes

- [x] Dashboard con ventas, pedidos, ticket promedio, clientes nuevos
- [x] Embudo de conversión (conversaciones → pedidos → pagados)
- [x] Desglose diario y por canal
- [x] Tiempo promedio de respuesta del agente
- [x] Tiempo conversación → pedido
- [x] Top productos vendidos
- [x] Reporte diario automático al dueño por WhatsApp (cron)
- [x] Inventario: productos agotados y bajo mínimo

---

## Clientes

- [x] Base de clientes con nombre, teléfono, canal
- [x] Historial de pedidos por cliente
- [x] Memoria de IA por cliente (preferencias, direcciones, contexto)
- [x] Segmentación: frecuente, inactivo, en riesgo

---

## Multi-canal

- [x] WhatsApp Business API (principal)
- [x] Arquitectura preparada para Instagram Direct y Messenger

---

## Panel de Administración (Dashboard Web)

- [x] Dashboard principal con KPIs
- [x] Gestión de pedidos con estados visuales
- [x] Catálogo de productos (CRUD)
- [x] Vista de clientes
- [x] Conversaciones (lectura de chats)
- [x] Escalaciones (quejas pendientes)
- [x] Tickets de soporte
- [x] Pagos y verificaciones
- [x] Entregas y repartidores
- [x] Reportes
- [x] Analytics (embudo de conversión)
- [x] Promociones y combos
- [x] Programa de lealtad
- [x] Configuración: AI, horarios, datos bancarios, media, knowledge base
- [x] Roles: admin, manager, operator

---

## Configuración del Negocio (Onboarding vía WhatsApp)

- [x] Registro del negocio conversando con Max (agente admin de VSPRO)
- [x] Alta de productos por chat o por foto del menú (OCR/visión)
- [x] Configuración de horarios por chat
- [x] Configuración de datos bancarios por chat
- [x] Alta de repartidores por chat
- [x] Subida de material gráfico (menú, promos) desde dashboard

---

## Infraestructura y Seguridad

- [x] Multi-tenant con schema PostgreSQL por negocio (aislamiento total)
- [x] SSL wildcard (\*.vspro.app)
- [x] Rate limiting por tenant
- [x] Docker Compose en producción
- [x] Nginx reverse proxy con caché
- [x] Redis para colas y caché
- [x] pgvector para búsqueda semántica
- [x] Planes y billing (Basic/Pro/Enterprise)

---

**Total: 85+ funciones activas en producción.**

_Última actualización: Junio 2026_
