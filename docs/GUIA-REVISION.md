# VSPRO — Guía de Revisión Completa

## Credenciales

### Tenant 1: Tortillería (ya existe en BD)
| Campo | Valor |
|-------|-------|
| Negocio | `tortilleria-don-jose` |
| Email | `jose@tortilleria.com` |
| Contraseña | `MiPassword123!` |
| Rol | admin |

### Tenants del Seed Chaos (después de correr el seed)
| Tenant | Negocio | Email | Contraseña | Plan |
|--------|---------|-------|------------|------|
| `demo-tortilleria` | Tortillería La Abuela | `admin@tortilleria-demo.com` | `Demo123!` | Básico |
| `demo-panaderia` | Panadería El Trigal | `admin@panaderia-demo.com` | `Demo123!` | Pro |
| `demo-taqueria` | Taquería Los Compadres | `admin@taqueria-demo.com` | `Demo123!` | Pro (Trial) |

Cada tenant tiene también un operador: `operador@{slug}.com` / `Demo123!`

---

## URLs del Sistema

| URL | Qué es |
|-----|--------|
| `http://localhost:3002/login` | Login |
| `http://localhost:3002/onboarding` | Registro de nuevo negocio |
| `http://localhost:3002` | Dashboard principal |
| `http://localhost:3002/orders` | Gestión de pedidos |
| `http://localhost:3002/production` | Kanban de producción |
| `http://localhost:3002/products` | Catálogo y stock |
| `http://localhost:3002/customers` | Clientes |
| `http://localhost:3002/conversations` | Chat con clientes |
| `http://localhost:3002/payments` | Pagos y comprobantes |
| `http://localhost:3002/settings` | Configuración general |
| `http://localhost:3002/settings/team` | Gestión de equipo |
| `http://localhost:3002/settings/ai` | Configuración del asistente IA |
| `http://localhost:3002/settings/ai-memory` | Memoria de IA por cliente |
| `http://localhost:3002/settings/channels` | Canales de mensajería |
| `http://localhost:3002/super-admin` | Panel de super-admin |
| `http://localhost:3001/docs` | Swagger (API docs) |
| `http://localhost:3001/health` | Health check |

---

## Cómo levantar todo

```bash
# 1. Abrir Docker Desktop

# 2. Levantar infraestructura
docker compose up postgres redis -d

# 3. Generar cliente Prisma
DATABASE_URL="postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db" \
  npx prisma generate --schema=packages/database/prisma/schema.prisma

# 4. Correr seed de datos (OPCIONAL — solo si quieres los 3 tenants demo)
DATABASE_URL="postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db" \
  npx ts-node --compiler-options '{"module":"CommonJS"}' packages/database/prisma/seed-chaos.ts

# 5. Levantar API (terminal 1)
DATABASE_URL="postgresql://vspro:vspro_dev_pass@localhost:5433/vspro_db" \
REDIS_HOST=localhost REDIS_PORT=6380 REDIS_PASSWORD=vspro_redis_dev \
JWT_SECRET=vspro-dev-jwt-secret-min-32-characters \
META_APP_SECRET=test-meta-app-secret NODE_ENV=development PORT=3001 \
npx ts-node --transpile-only --project apps/api/tsconfig.json apps/api/src/main.ts

# 6. Levantar Panel (terminal 2)
npx next dev --port 3002 --dir apps/web
```

---

## Recorrido por módulo

### 1. Login (`/login`)
- Ingresa las credenciales de cualquier tenant
- Verifica que redirige al dashboard después del login
- Prueba con credenciales incorrectas → debe mostrar error

### 2. Dashboard (`/`)
- 4 stat cards (pedidos hoy, en producción, listos, ventas)
- Pedidos recientes con estado y color
- Cola de producción resumida

### 3. Pedidos (`/orders`)
- Tabla con todos los pedidos
- Filtros por estado (botones arriba)
- Cada pedido muestra: número, cliente, estado (badge color), total, fecha

### 4. Producción — Kanban (`/production`)
- 4 columnas: Pendiente → En producción → Listo → Enviado
- Arrastrar tarjetas entre columnas (drag & drop)
- Botones de acción en cada tarjeta
- Contador de pedidos por columna

### 5. Productos (`/products`)
- Tabla con nombre, SKU, precio, stock, estado
- Stock bajo se muestra en rojo
- Botón "+ Nuevo producto" abre formulario inline
- Crear producto y verificar que aparece en la tabla

### 6. Clientes (`/customers`)
- Tabla con nombre, canal (icono), contacto, fecha
- Los clientes se crean automáticamente cuando escriben por WhatsApp

### 7. Conversaciones (`/conversations`)
- Lista de conversaciones a la izquierda
- Chat a la derecha con burbujas (inbound/outbound)
- Badge de canal (WhatsApp verde, Messenger azul, Instagram rosa)

### 8. Pagos (`/payments`)
- Stub — conectar con `GET /payments/order/:id`

### 9. Configuración — Equipo (`/settings/team`)
- Tabla de usuarios con rol editable (dropdown)
- Botón "Invitar usuario" → formulario con nombre, email, rol
- Desactivar/reactivar usuarios

### 10. Configuración — IA (`/settings/ai`)
- Panel izquierdo: nombre del asistente, tono, mensajes, instrucciones
- Panel derecho: chat de prueba en vivo
- Guardar cambios y probar que la IA responde diferente

### 11. Configuración — Memoria IA (`/settings/ai-memory`)
- Lista de clientes a la izquierda
- Memorias del cliente seleccionado a la derecha
- (Se llenan automáticamente después de conversaciones)

### 12. Configuración — Canales (`/settings/channels`)
- Canales conectados con estado
- Botón "Probar conexión"
- Accordion para conectar nuevos canales (WhatsApp, Messenger, Instagram)

### 13. Super Admin (`/super-admin`)
- 8 stat cards (MRR, tenants, uso)
- Tabla de todos los tenants
- Botón "Entrar" (impersonar) → abre nueva pestaña como admin del tenant
- Botón "Suspender" / "Reactivar"

### 14. Onboarding (`/onboarding`)
- Paso 1: datos del negocio (auto-genera slug)
- Paso 2: primer producto (opcional)
- Paso 3: confirmación con credenciales y próximos pasos

---

## API — Probar con curl

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -H "x-tenant-slug: tortilleria-don-jose" \
  -d '{"email":"jose@tortilleria.com","password":"MiPassword123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Listar productos
curl -s http://localhost:3001/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-slug: tortilleria-don-jose" | python3 -m json.tool

# Listar pedidos
curl -s http://localhost:3001/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-slug: tortilleria-don-jose" | python3 -m json.tool

# Stats de producción
curl -s http://localhost:3001/production/stats \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-slug: tortilleria-don-jose" | python3 -m json.tool

# Info de billing
curl -s http://localhost:3001/billing/subscription \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-slug: tortilleria-don-jose" | python3 -m json.tool

# Uso del mes (quotas)
curl -s http://localhost:3001/billing/usage \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-slug: tortilleria-don-jose" | python3 -m json.tool

# Super admin stats
curl -s http://localhost:3001/super-admin/stats \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-slug: tortilleria-don-jose" | python3 -m json.tool
```

---

## Apagar todo

```bash
# Detener frontend: Ctrl+C en la terminal 2
# Detener API: Ctrl+C en la terminal 1
# Detener Docker:
docker compose stop
```
