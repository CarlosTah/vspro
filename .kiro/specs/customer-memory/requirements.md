# Requirements Document

## Introduction

Hybrid long-term memory system for customers in VSPRO. Combines JSONB-based deterministic profiles (structured data such as preferences, sizes, addresses, purchase history summaries) with pgvector-based episodic conversational memory (semantic search over past conversation snippets). Includes an `update_customer_memory` LangChain tool callable by the AI assistant during conversations to persist learned facts, and a retrieval mechanism that merges structured profile data with semantically relevant episodic memories for context injection.

## Glossary

- **Memory_Service**: The NestJS service responsible for storing, retrieving, and managing customer memory data (evolution of the existing `AiMemoryService`).
- **Customer_Profile**: The JSONB column in the `customer_memories` table that stores deterministic structured data about a customer (preferences, sizes, addresses, purchase history summaries).
- **Episodic_Memory**: A vector-embedded text snippet from a past conversation, stored in the `customer_memories` table for semantic retrieval.
- **Embedding_Pipeline**: The subsystem that converts conversation text into vector embeddings using OpenAI's text-embedding-3-small model.
- **Update_Memory_Tool**: The OpenAI function-calling tool (`update_customer_memory`) that the AI assistant invokes during conversations to persist learned facts.
- **Hybrid_Retrieval**: The mechanism that combines structured Customer_Profile lookup with semantic vector search over Episodic_Memory entries to build context for the AI.
- **Tenant_Schema**: The PostgreSQL schema isolated per tenant (e.g., `vikids`, `room359`) containing all business tables.
- **Memory_API**: The REST API endpoints exposed for dashboard users to view and manage customer memory.

## Requirements

### Requirement 1: Customer Memories Table

**User Story:** As a platform operator, I want a dedicated `customer_memories` table in each tenant schema, so that customer memory data is stored with proper structure and tenant isolation.

#### Acceptance Criteria

1. WHEN a tenant schema is provisioned, THE Memory_Service SHALL create a `customer_memories` table with columns: `id` (UUID PK), `customer_id` (UUID FK to customers), `profile` (JSONB), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ).
2. WHEN a tenant schema is provisioned, THE Memory_Service SHALL create a `customer_memory_episodes` table with columns: `id` (UUID PK), `customer_id` (UUID FK to customers), `content` (TEXT), `embedding` (vector(1536)), `category` (VARCHAR(50)), `created_at` (TIMESTAMPTZ).
3. THE Memory_Service SHALL enforce a unique constraint on `customer_id` in the `customer_memories` table so that each customer has exactly one profile record.
4. THE Memory_Service SHALL create an HNSW index on the `embedding` column of `customer_memory_episodes` for efficient approximate nearest-neighbor search.
5. THE Memory_Service SHALL create an index on `customer_id` in `customer_memory_episodes` for efficient filtering by customer.

### Requirement 2: Deterministic Profile Storage

**User Story:** As an AI assistant, I want to store structured facts about customers in a JSONB profile, so that I can retrieve deterministic information without semantic search.

#### Acceptance Criteria

1. WHEN the Update_Memory_Tool is called with a structured fact (preference, size, address, or purchase summary), THE Memory_Service SHALL upsert the fact into the Customer_Profile JSONB under the appropriate key.
2. THE Memory_Service SHALL support the following top-level keys in Customer_Profile: `preferences`, `sizes`, `addresses`, `purchase_history_summary`, `important_dates`, `custom_facts`.
3. WHEN a profile key already contains a value and a new value is provided, THE Memory_Service SHALL merge the new value with the existing value without overwriting unrelated keys.
4. WHEN the Customer_Profile is retrieved, THE Memory_Service SHALL return the complete JSONB object for the specified customer within 50ms for cached reads.

### Requirement 3: Episodic Conversational Memory

**User Story:** As an AI assistant, I want to store conversation snippets as vector embeddings, so that I can semantically retrieve relevant past interactions during future conversations.

#### Acceptance Criteria

1. WHEN the Update_Memory_Tool is called with an episodic fact (conversation snippet or learned context), THE Embedding_Pipeline SHALL generate a 1536-dimensional vector embedding using the text-embedding-3-small model.
2. WHEN an embedding is generated, THE Memory_Service SHALL store the text content, embedding vector, and category in the `customer_memory_episodes` table.
3. THE Memory_Service SHALL support the following categories for episodic memories: `conversation_summary`, `preference_detected`, `complaint`, `product_interest`, `general_context`.
4. IF the OpenAI embedding API is unavailable, THEN THE Memory_Service SHALL store the episodic memory with a NULL embedding and log a warning for later backfill.

### Requirement 4: update_customer_memory Tool

**User Story:** As an AI assistant, I want to call an `update_customer_memory` tool during conversations, so that I can persist learned facts about customers in real time.

#### Acceptance Criteria

1. THE Update_Memory_Tool SHALL be registered as an OpenAI function-calling tool with parameters: `memory_type` (enum: "profile" | "episode"), `category` (string), `content` (string), and `data` (object, optional for structured profile updates).
2. WHEN the AI assistant calls the Update_Memory_Tool with `memory_type` = "profile", THE Memory_Service SHALL upsert the provided data into the Customer_Profile JSONB.
3. WHEN the AI assistant calls the Update_Memory_Tool with `memory_type` = "episode", THE Memory_Service SHALL create a new Episodic_Memory entry with the provided content and category.
4. WHEN the Update_Memory_Tool is called, THE Memory_Service SHALL return a confirmation message indicating the memory was saved.
5. IF the `customer_id` cannot be resolved from the conversation context, THEN THE Update_Memory_Tool SHALL return an error message indicating the customer is not identified.

### Requirement 5: Hybrid Retrieval Mechanism

**User Story:** As an AI assistant, I want to retrieve both structured profile data and semantically relevant episodic memories, so that I can provide personalized responses with full customer context.

#### Acceptance Criteria

1. WHEN a message is received from a customer, THE Hybrid_Retrieval SHALL fetch the Customer_Profile JSONB for that customer.
2. WHEN a message is received from a customer, THE Hybrid_Retrieval SHALL perform a cosine similarity search on the customer's episodic memories using the current message embedding, returning the top 5 most relevant episodes.
3. THE Hybrid_Retrieval SHALL combine the structured profile and relevant episodes into a formatted context string injected into the AI system prompt.
4. WHEN a customer has no stored memories, THE Hybrid_Retrieval SHALL return an empty context without errors.
5. THE Hybrid_Retrieval SHALL complete the full retrieval (profile + semantic search) within 200ms under normal database load.

### Requirement 6: Integration with AiEngineService

**User Story:** As a platform developer, I want the memory system integrated into the existing AI engine flow, so that memory enrichment happens automatically during conversations.

#### Acceptance Criteria

1. WHEN the AiEngineService processes a message, THE AiEngineService SHALL include the Update_Memory_Tool in the tools array passed to OpenAI.
2. WHEN the AI returns a tool call for `update_customer_memory`, THE AiEngineService SHALL execute the tool via the Memory_Service and include the result in the follow-up API call.
3. WHEN a conversation is resolved or after a configurable number of messages, THE Memory_Service SHALL automatically generate a conversation summary and store it as an Episodic_Memory.
4. THE AiEngineService SHALL inject the Hybrid_Retrieval context into the system prompt before the customer profile section.

### Requirement 7: Memory Management API

**User Story:** As a dashboard user, I want API endpoints to view and manage customer memories, so that I can audit and correct the AI's learned knowledge.

#### Acceptance Criteria

1. WHEN a GET request is made to `/customers/:id/memory`, THE Memory_API SHALL return the Customer_Profile and the 20 most recent Episodic_Memory entries for that customer.
2. WHEN a PATCH request is made to `/customers/:id/memory/profile`, THE Memory_API SHALL update the specified keys in the Customer_Profile JSONB.
3. WHEN a DELETE request is made to `/customers/:id/memory/episodes/:episodeId`, THE Memory_API SHALL delete the specified Episodic_Memory entry.
4. WHEN a DELETE request is made to `/customers/:id/memory`, THE Memory_API SHALL delete all memory data (profile and episodes) for that customer.
5. THE Memory_API SHALL require authentication and tenant context for all endpoints.
6. THE Memory_API SHALL validate that the customer belongs to the requesting tenant's schema before performing operations.

### Requirement 8: Migration from Existing ai_memories Table

**User Story:** As a platform operator, I want existing memory data migrated to the new schema, so that no customer context is lost during the upgrade.

#### Acceptance Criteria

1. WHEN the migration runs, THE Memory_Service SHALL copy existing `ai_memories` records of type `conversation_summary` into `customer_memory_episodes` with category `conversation_summary`.
2. WHEN the migration runs, THE Memory_Service SHALL copy existing `ai_memories` records of type `preference` into `customer_memory_episodes` with category `preference_detected`.
3. WHEN the migration runs, THE Memory_Service SHALL preserve existing embeddings from `ai_memories` in the new `customer_memory_episodes` table.
4. WHEN the migration completes, THE Memory_Service SHALL log the count of migrated records per customer.
