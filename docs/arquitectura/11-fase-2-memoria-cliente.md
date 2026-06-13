# Fase 2 — Memoria Híbrida de Cliente

> **Feature:** `customer-memory`
> **Spec:** `.kiro/specs/customer-memory/`
> **Estado:** Diseñado, pendiente implementación

---

## 1. Resumen Ejecutivo

Sistema de memoria a largo plazo para clientes que combina dos estrategias complementarias dentro del schema aislado de cada tenant:

| Capa | Almacenamiento | Uso |
|------|---------------|-----|
| **Perfil Determinístico** | JSONB en `customer_memories` | Preferencias, tallas, direcciones, historial de compras |
| **Memoria Episódica** | vector(1536) en `customer_memory_episodes` | Búsqueda semántica sobre conversaciones pasadas |

La IA escribe autónomamente en ambas capas via el tool `update_customer_memory` durante las conversaciones. Un mecanismo de retrieval híbrido inyecta el contexto completo en el system prompt.

---

## 2. Modelo de Datos (PostgreSQL 16 + pgvector)

### 2.1 Tabla: `customer_memories` (1:1 por cliente)

```sql
CREATE TABLE IF NOT EXISTS "{{schema}}".customer_memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "{{schema}}".customers(id) ON DELETE CASCADE,
  profile     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(customer_id)
);
```

### 2.2 Tabla: `customer_memory_episodes` (1:N por cliente)

```sql
CREATE TABLE IF NOT EXISTS "{{schema}}".customer_memory_episodes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES "{{schema}}".customers(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  embedding   vector(1536),
  category    VARCHAR(50) NOT NULL DEFAULT 'general_context',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index para búsqueda semántica eficiente
CREATE INDEX IF NOT EXISTS idx_customer_memory_episodes_embedding
  ON "{{schema}}".customer_memory_episodes
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_customer_memory_episodes_customer
  ON "{{schema}}".customer_memory_episodes(customer_id);
```

### 2.3 Estructura del Perfil JSONB

```typescript
interface CustomerProfile {
  preferences?: Record<string, any>;       // { "color": "azul", "estilo": "casual" }
  sizes?: Record<string, string>;           // { "camisa": "M", "zapatos": "42" }
  addresses?: Array<{ label, street, city, zip? }>;
  purchase_history_summary?: {
    total_orders: number;
    favorite_products: string[];
    average_order_value: number;
    last_order_date: string;
  };
  important_dates?: Record<string, string>; // { "cumpleaños": "1990-03-15" }
  custom_facts?: Record<string, any>;       // key-value libre
}
```

### 2.4 Categorías de Episodios

```
conversation_summary | preference_detected | complaint | product_interest | general_context
```

### 2.5 Estrategia de Merge JSONB

```sql
-- Upsert con deep-merge (no sobreescribe keys no afectadas)
UPDATE "{{schema}}".customer_memories
SET profile = jsonb_set(
  profile,
  ARRAY[$category],
  COALESCE(profile->$category, '{}'::jsonb) || $data::jsonb
),
updated_at = NOW()
WHERE customer_id = $customer_id::uuid;
```

---

## 3. AI Engine — Tool `update_customer_memory`

### 3.1 Schema del Tool (OpenAI Function Calling)

```json
{
  "name": "update_customer_memory",
  "description": "Guarda información aprendida sobre el cliente para futuras conversaciones.",
  "parameters": {
    "type": "object",
    "properties": {
      "memory_type": { "type": "string", "enum": ["profile", "episode"] },
      "category": { "type": "string" },
      "content": { "type": "string" },
      "data": { "type": "object" }
    },
    "required": ["memory_type", "category"]
  }
}
```

### 3.2 Flujo de Ejecución

```
Mensaje entrante
  → AiEngineService.processMessage()
    → CustomerMemoryService.buildMemoryContext(customerId, message, schema)
      → getProfile() + searchEpisodes(embedding, top-5)
      → Formatear como string de contexto
    → Inyectar en system prompt
    → OpenAI GPT-4o call (con update_customer_memory en tools[])
      → Si tool_call: update_customer_memory
        → handleToolCall(customerId, args, schema)
          → memory_type="profile" → upsertProfile()
          → memory_type="episode" → generateEmbedding() + createEpisode()
        → Retornar confirmación al AI
      → Respuesta final al cliente
```

### 3.3 Integración con `AiEngineService`

Cambios requeridos:
1. **`getTools()`** — Agregar `update_customer_memory` al array de tools
2. **`executeTool()`** — Agregar case para delegar a `CustomerMemoryService.handleToolCall()`
3. **`processMessage()`** — Reemplazar `AiMemoryService.buildMemoryContext()` por `CustomerMemoryService.buildMemoryContext()`

### 3.4 Degradación Graceful

| Escenario | Comportamiento |
|-----------|---------------|
| Sin embeddings disponibles | Episodios ordenados por fecha (más recientes) |
| Sin perfil | Solo episodios en el contexto |
| Sin episodios | Solo perfil en el contexto |
| Sistema de memoria caído | IA continúa sin contexto de memoria |
| OpenAI embedding API caída | Almacenar con embedding NULL, backfill posterior |

---

## 4. API REST (Dashboard)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/customers/:id/memory` | Perfil + 20 episodios recientes |
| PATCH | `/customers/:id/memory/profile` | Actualizar keys del perfil |
| DELETE | `/customers/:id/memory/episodes/:episodeId` | Eliminar episodio |
| DELETE | `/customers/:id/memory` | Eliminar toda la memoria |

Todos los endpoints requieren autenticación + contexto de tenant.

---

## 5. Aislamiento de Tenant (Seguridad Crítica)

### 5.1 Garantías

- Ambas tablas viven dentro del schema del tenant (`"tenant_vikids"`, `"tenant_room359"`)
- `search_path` se establece por conexión via `TenantPrismaService`
- No existe tabla compartida de memorias — imposible leak cross-tenant a nivel SQL
- Vector search opera exclusivamente dentro del schema del tenant

### 5.2 Tests de Aislamiento Requeridos

```
✓ Crear memoria en tenant A, query desde tenant B → 0 resultados
✓ Vector search en tenant A nunca retorna episodios de tenant B
✓ Profile upsert en tenant A no afecta perfiles de tenant B
✓ Migración solo procesa registros del schema target
```

---

## 6. Migración desde `ai_memories`

| Legacy Type | → Nueva Categoría |
|-------------|-------------------|
| `conversation_summary` | `conversation_summary` |
| `preference` | `preference_detected` |
| `order_history` | `general_context` |

- Preservar embeddings existentes (copiar vector as-is)
- Skip registros sin FK válido a customers, log warning
- Log conteo de registros migrados por cliente

---

## 7. Dependencias

| Paquete | Versión | Uso |
|---------|---------|-----|
| pgvector | (ya instalado) | Extensión PostgreSQL para vectores |
| openai | ^4.77.3 | text-embedding-3-small |
| fast-check | ^3.x | Property-based testing |

---

## 8. Plan de Implementación

Ver `.kiro/specs/customer-memory/tasks.md` para el plan detallado con 24 sub-tareas en 10 waves de ejecución.

**Orden de dependencias:**
1. Schema DDL + tipos TypeScript
2. CustomerMemoryService (profile → episodes → retrieval → tool handler)
3. CustomerMemoryController + registro en módulo
4. Integración con AiEngineService
5. Tests (property + unit + integration + isolation)
6. Migración de datos legacy
