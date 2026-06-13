# Implementation Plan: Customer Memory

## Overview

Implement a hybrid long-term memory system for customers combining JSONB-based deterministic profiles with pgvector-based episodic conversational memory. The implementation follows a dependency-driven order: schema → service → controller → AI integration → tests → migration.

## Tasks

- [ ] 1. Database schema and core types
  - [ ] 1.1 Add `customer_memories` and `customer_memory_episodes` tables to tenant-schema.sql
    - Add `customer_memories` table with columns: `id` (UUID PK), `customer_id` (UUID FK → customers, UNIQUE), `profile` (JSONB DEFAULT '{}'), `created_at`, `updated_at`
    - Add `customer_memory_episodes` table with columns: `id` (UUID PK), `customer_id` (UUID FK → customers ON DELETE CASCADE), `content` (TEXT NOT NULL), `embedding` (vector(1536)), `category` (VARCHAR(50) NOT NULL DEFAULT 'general_context'), `created_at`
    - Add HNSW index on `embedding` column with `vector_cosine_ops` (m=16, ef_construction=64)
    - Add index on `customer_id` in `customer_memory_episodes`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 1.2 Create TypeScript interfaces and DTOs for customer memory
    - Create `CustomerProfile` interface with keys: `preferences`, `sizes`, `addresses`, `purchase_history_summary`, `important_dates`, `custom_facts`
    - Create `EpisodeCategory` type union: `conversation_summary | preference_detected | complaint | product_interest | general_context`
    - Create `EpisodeResult` interface with `id`, `content`, `category`, `similarity?`, `createdAt`
    - Create `UpdateCustomerMemoryArgs` interface with `memory_type`, `category`, `content?`, `data?`
    - Create `UpdateProfileDto` (class-validator) for PATCH endpoint
    - Create `MigrationResult` interface
    - _Requirements: 2.2, 3.3, 4.1_

- [ ] 2. CustomerMemoryService implementation
  - [ ] 2.1 Create CustomerMemoryService with profile operations
    - Create `apps/api/src/modules/ai/customer-memory.service.ts`
    - Implement `upsertProfile(customerId, category, data, schemaName)` using JSONB deep-merge SQL (ON CONFLICT DO UPDATE with `jsonb_set`)
    - Implement `getProfile(customerId, schemaName)` returning the full JSONB profile
    - Validate profile category keys against allowlist; reject invalid keys with error
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 2.2 Implement episode operations in CustomerMemoryService
    - Implement `createEpisode(customerId, content, category, schemaName)` — validate category, generate embedding, insert row
    - Implement `searchEpisodes(customerId, queryEmbedding, schemaName, limit=5)` — cosine similarity search ordered by descending similarity
    - Implement `getRecentEpisodes(customerId, schemaName, limit=20)` — ordered by `created_at DESC` (for dashboard)
    - Implement `deleteEpisode(episodeId, customerId, schemaName)` — verify ownership before delete
    - Implement `deleteAllMemory(customerId, schemaName)` — delete from both tables
    - Store with NULL embedding if OpenAI API unavailable, log warning
    - Validate episode category against allowlist; reject invalid categories
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 2.3 Implement embedding generation and hybrid retrieval
    - Implement `generateEmbedding(text)` using OpenAI text-embedding-3-small (reuse pattern from existing `AiMemoryService`)
    - Implement `buildMemoryContext(customerId, currentMessage, schemaName)` — fetch profile + top-5 semantic episodes, format as context string
    - Return empty string when customer has no memories
    - Handle graceful degradation: no embeddings → recent episodes; no profile → episodes only; no episodes → profile only
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 2.4 Implement tool handler in CustomerMemoryService
    - Implement `handleToolCall(customerId, args, schemaName)` — route to `upsertProfile` or `createEpisode` based on `memory_type`
    - Return confirmation message on success
    - Return error JSON `{"error": "customer_not_identified"}` when customerId is null/undefined
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [ ] 3. Checkpoint - Core service tests
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. CustomerMemoryController and API
  - [ ] 4.1 Create CustomerMemoryController with REST endpoints
    - Create `apps/api/src/modules/ai/customer-memory.controller.ts`
    - `GET /customers/:customerId/memory` → return profile + 20 recent episodes
    - `PATCH /customers/:customerId/memory/profile` → update profile keys via `upsertProfile`
    - `DELETE /customers/:customerId/memory/episodes/:episodeId` → delete single episode
    - `DELETE /customers/:customerId/memory` → delete all memory for customer
    - Apply `@Tenant()` decorator for schema resolution
    - Apply authentication guard (existing pattern)
    - Validate customer belongs to tenant schema before operations
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ] 4.2 Register CustomerMemoryService and Controller in AiModule
    - Add `CustomerMemoryService` to providers in `ai.module.ts`
    - Add `CustomerMemoryController` to controllers in `ai.module.ts`
    - Ensure proper dependency injection (PrismaService, ConfigService)
    - _Requirements: 7.5_

- [ ] 5. AiEngineService integration
  - [ ] 5.1 Register `update_customer_memory` tool in AiEngineService
    - Add the `update_customer_memory` tool definition to `getTools()` array with the schema from the design document
    - _Requirements: 4.1, 6.1_

  - [ ] 5.2 Handle `update_customer_memory` tool call in executeTool
    - Add case `'update_customer_memory'` in `executeTool()` switch
    - Resolve `customerId` from `conversation.context`
    - Delegate to `CustomerMemoryService.handleToolCall()`
    - Return error if customerId not available
    - _Requirements: 6.2, 4.5_

  - [ ] 5.3 Replace AiMemoryService with CustomerMemoryService for context retrieval
    - Replace `this.aiMemory.buildMemoryContext()` call with `this.customerMemory.buildMemoryContext()`
    - Inject `CustomerMemoryService` in constructor (replace or add alongside `AiMemoryService`)
    - Ensure memory context is injected into system prompt before the conversation messages
    - _Requirements: 6.4, 5.1, 5.3_

- [ ] 6. Checkpoint - Integration verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Testing
  - [ ]* 7.1 Write property test for profile upsert merge invariant
    - **Property 1: Profile upsert merge invariant**
    - **Validates: Requirements 2.1, 2.3**
    - Use fast-check to generate random initial profiles and partial updates; verify untargeted keys remain unchanged

  - [ ]* 7.2 Write property test for profile key validation
    - **Property 2: Profile key validation**
    - **Validates: Requirements 2.2**
    - Use fast-check to generate arbitrary strings; verify only allowed keys are accepted

  - [ ]* 7.3 Write property test for episode storage round-trip
    - **Property 3: Episode storage round-trip**
    - **Validates: Requirements 3.2**
    - Use fast-check to generate random content + categories; verify retrieval returns same data

  - [ ]* 7.4 Write property test for episode category validation
    - **Property 4: Episode category validation**
    - **Validates: Requirements 3.3**
    - Use fast-check to generate arbitrary strings; verify only allowed categories are accepted

  - [ ]* 7.5 Write property test for semantic search ordering and limit
    - **Property 5: Semantic search ordering and limit**
    - **Validates: Requirements 5.2**
    - Use fast-check to generate random embedding vectors; verify results are ordered by descending cosine similarity and capped at 5

  - [ ]* 7.6 Write property test for hybrid context completeness
    - **Property 6: Hybrid context completeness**
    - **Validates: Requirements 5.1, 5.3**
    - Use fast-check to generate random profiles + episodes; verify context string contains profile data and episode content

  - [ ]* 7.7 Write property test for tenant isolation
    - **Property 7: Tenant isolation for memory operations**
    - **Validates: Requirements 7.6**
    - Use fast-check to generate random UUIDs not in schema; verify operations fail with not-found/forbidden

  - [ ]* 7.8 Write property test for unique profile per customer
    - **Property 9: Unique profile per customer**
    - **Validates: Requirements 1.3**
    - Use fast-check to generate random upsert sequences; verify at most one row per customer_id

  - [ ]* 7.9 Write unit tests for CustomerMemoryService
    - Test tool handler returns confirmation message (Req 4.4)
    - Test tool handler returns error when customer_id missing (Req 4.5)
    - Test empty memory returns empty context string (Req 5.4)
    - Test embedding API failure stores NULL embedding (Req 3.4)
    - _Requirements: 3.4, 4.4, 4.5, 5.4_

  - [ ]* 7.10 Write unit tests for CustomerMemoryController
    - Test API endpoints require authentication (Req 7.5)
    - Test customer ownership validation (Req 7.6)
    - Test GET returns profile + episodes (Req 7.1)
    - Test DELETE removes all memory (Req 7.4)
    - _Requirements: 7.1, 7.4, 7.5, 7.6_

  - [ ]* 7.11 Write integration test for AiEngineService memory flow
    - Test tool is registered in getTools() array (Req 6.1)
    - Test system prompt contains memory context (Req 6.4)
    - Test executeTool delegates to CustomerMemoryService (Req 6.2)
    - _Requirements: 6.1, 6.2, 6.4_

  - [ ]* 7.12 Write tenant isolation integration tests
    - Create memory in tenant A, query from tenant B → returns nothing
    - Vector search in tenant A never returns tenant B episodes
    - Profile upsert in tenant A never affects tenant B profiles
    - _Requirements: 7.6_

- [ ] 8. Migration from legacy ai_memories
  - [ ] 8.1 Create migration script for existing ai_memories data
    - Create `apps/api/src/modules/ai/migrations/migrate-ai-memories.ts`
    - Copy `ai_memories` records with type `conversation_summary` → `customer_memory_episodes` with category `conversation_summary`
    - Copy `ai_memories` records with type `preference` → `customer_memory_episodes` with category `preference_detected`
    - Preserve existing embeddings (copy vector column as-is)
    - Skip records with missing `customer_id` FK, log warning with record ID
    - Log count of migrated records per customer on completion
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 8.2 Write property test for migration data mapping
    - **Property 8: Migration preserves data and maps categories**
    - **Validates: Requirements 8.1, 8.2, 8.3**
    - Use fast-check to generate random legacy records; verify correct category mapping and embedding preservation

- [ ] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `AiMemoryService` is kept until migration is complete; `CustomerMemoryService` replaces its usage in `AiEngineService`
- All SQL uses the `"{{schema}}"` pattern consistent with existing tenant-schema.sql

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4"] },
    { "id": 4, "tasks": ["4.1", "5.1"] },
    { "id": 5, "tasks": ["4.2", "5.2", "5.3"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.8", "7.9"] },
    { "id": 7, "tasks": ["7.5", "7.6", "7.7", "7.10", "7.11"] },
    { "id": 8, "tasks": ["7.12", "8.1"] },
    { "id": 9, "tasks": ["8.2"] }
  ]
}
```
