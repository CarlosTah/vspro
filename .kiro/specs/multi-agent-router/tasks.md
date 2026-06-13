# Implementation Plan: Multi-Agent Router

## Overview

Refactor the monolithic AiEngineService into a multi-agent architecture with specialized agents routed by intent classification. Implementation follows dependency order: schema → base abstractions → router → agents → integration → tests.

## Tasks

- [ ] 1. Database schema extensions and TypeScript types
  - [ ] 1.1 Add `supplier_info` and `agent_config` fields to tenant-schema.sql
    - Add `supplier_info JSONB DEFAULT '{}'` to products table
    - Add `agent_config JSONB DEFAULT '{...}'` to ai_config table with default config enabling sales + general agents
    - Apply migration to existing tenant schemas (vikids, room359, etc.)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 1.2 Create TypeScript interfaces for multi-agent system
    - Create `apps/api/src/modules/ai/agents/types.ts`
    - Define: `AgentType`, `AgentContext`, `AgentResponse`, `AgentSettings`, `AgentConfig`, `CommercialPolicies`, `SupplierInfo`, `RouteResult`, `ReconciliationResult`
    - _Requirements: 1.1, 6.1, 6.2_

- [ ] 2. Base Agent abstraction
  - [ ] 2.1 Create BaseAgent abstract class
    - Create `apps/api/src/modules/ai/agents/base-agent.ts`
    - Define abstract properties: name, description
    - Define abstract methods: getSystemPrompt(), getTools(), executeTool()
    - Implement shared process() method: build messages → call OpenAI → handle tool calls → return response
    - Inject PrismaService, ConfigService, CustomerMemoryService via constructor
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 3. Agent Router
  - [ ] 3.1 Create AgentRouterService with heuristic classification
    - Create `apps/api/src/modules/ai/agents/agent-router.service.ts`
    - Implement `classifyHeuristic()`: keyword regex matching for sales, finance, support intents + order state detection
    - Implement `route()` method: cache check → heuristic → LLM fallback → default to general
    - Return RouteResult with agent type, confidence score, and source
    - _Requirements: 2.1, 2.3, 2.7_

  - [ ] 3.2 Add LLM fallback classification
    - Implement `classifyLLM()` using gpt-4o-mini with classification prompt
    - Parse JSON response: {intent, confidence}
    - Handle parse errors gracefully (default to general with low confidence)
    - _Requirements: 2.2, 2.3_

  - [ ] 3.3 Implement Redis intent cache
    - Cache key: `intent:{conversationId}`, value: JSON {agent, confidence, cachedAt}
    - TTL: 30 minutes
    - Implement `getCachedIntent()`, `cacheIntent()`, `invalidateCache()`
    - Skip cache gracefully if Redis unavailable
    - _Requirements: 2.5, 9.2, 9.3, 9.5_

  - [ ] 3.4 Implement confidence threshold and fallback logic
    - If confidence < 0.7 from any source → route to GeneralAgent
    - If agent is disabled in tenant config → route to GeneralAgent
    - _Requirements: 2.4, 6.3_

- [ ] 4. Specialized Agents
  - [ ] 4.1 Create GeneralAgent (backward compatibility wrapper)
    - Create `apps/api/src/modules/ai/agents/general-agent.ts`
    - Wrap current AiEngineService.getTools() as GeneralAgent.getTools()
    - Wrap current buildSystemPrompt() as GeneralAgent.getSystemPrompt()
    - Wrap current executeTool() switch as GeneralAgent.executeTool()
    - Ensure identical behavior to current monolithic service
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 4.2 Create SalesAgent
    - Create `apps/api/src/modules/ai/agents/sales-agent.ts`
    - System prompt optimized for conversion: urgency, benefits, objection handling
    - Exclusive tools: create_order, apply_discount, check_product_availability, suggest_upsell, schedule_follow_up
    - Read CommercialPolicies from agentConfig for discount limits
    - Enforce max_discount_percent in apply_discount execution
    - Trigger schedule_follow_up when customer hesitates
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 4.3 Create InventoryAgent
    - Create `apps/api/src/modules/ai/agents/inventory-agent.ts`
    - Implement `scanTenantStock()`: query products with stock < minimum
    - Implement `generateSupplierDraft()`: format email with product details + supplier_info
    - Implement `scanAllTenants()`: iterate active tenants, scan each, enqueue drafts
    - Create alert if supplier_info is missing for flagged products
    - Enqueue drafts to BullMQ queue `inventory-alerts` for admin review
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ] 4.4 Create FinanceAgent
    - Create `apps/api/src/modules/ai/agents/finance-agent.ts`
    - Implement `reconcileStripeEvent()`: match by order reference, calculate discrepancy
    - Auto-reconcile if discrepancy ≤ tolerance (default $5 MXN), add adjustment note
    - Escalate if discrepancy > tolerance with full details
    - Implement `dailyReconciliation()`: find unmatched payments > 24h old
    - Log all reconciliation actions in auditable format
    - Create alert if no matching payment found for Stripe event
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 5. Integration with AiEngineService
  - [ ] 5.1 Refactor AiEngineService.processMessage() to use router
    - Inject AgentRouterService and all agent instances
    - Replace monolithic flow with: route() → get agent → agent.process()
    - Maintain same input/output interface (AiEngineResponse)
    - Load agent_config from tenant's ai_config table
    - Pass AgentContext with conversation history, memory, tenant config
    - _Requirements: 8.4, 9.4_

  - [ ] 5.2 Register agents and router in AiModule
    - Add AgentRouterService to providers
    - Add SalesAgent, InventoryAgent, FinanceAgent, GeneralAgent to providers
    - Register BullMQ queue `inventory-alerts`
    - Add InventoryAgent cron registration via @nestjs/schedule
    - _Requirements: 6.1_

  - [ ] 5.3 Wire InventoryAgent cron into ProactivityModule or standalone
    - Register 6h cron for InventoryAgent.scanAllTenants()
    - Register daily cron for FinanceAgent.dailyReconciliation()
    - Ensure tenant isolation in cron scans (independent per tenant)
    - _Requirements: 4.1, 5.4_

- [ ] 6. Checkpoint — Verify compilation and basic routing
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Testing
  - [ ]* 7.1 Write unit tests for AgentRouterService
    - Test heuristic classification: sales keywords → sales agent
    - Test heuristic classification: finance keywords → finance agent
    - Test confidence threshold: < 0.7 → GeneralAgent
    - Test Redis cache hit returns cached result
    - Test Redis cache miss triggers classification
    - Test disabled agent in config → GeneralAgent
    - _Requirements: 2.1, 2.4, 2.5, 6.3, 9.2_

  - [ ]* 7.2 Write unit tests for SalesAgent
    - Test discount enforcement: rejects discount > max_discount_percent
    - Test discount within policy: applies successfully
    - Test suggest_upsell tool returns related products
    - Test schedule_follow_up triggered on hesitation
    - _Requirements: 3.3, 3.4, 3.5_

  - [ ]* 7.3 Write unit tests for InventoryAgent
    - Test scanTenantStock returns items below minimum
    - Test generateSupplierDraft formats email correctly
    - Test missing supplier_info creates alert
    - Test scan skips inactive products
    - _Requirements: 4.2, 4.3, 4.4, 4.6_

  - [ ]* 7.4 Write unit tests for FinanceAgent
    - Test auto-reconcile within tolerance
    - Test escalation above tolerance
    - Test no-match creates alert
    - Test daily reconciliation finds stale payments
    - _Requirements: 5.2, 5.3, 5.4, 5.6_

  - [ ]* 7.5 Write unit tests for GeneralAgent backward compatibility
    - Test same tools as current AiEngineService.getTools()
    - Test same system prompt structure
    - Test custom_tools from AiToolsExtenderService still work
    - _Requirements: 8.1, 8.4, 8.5_

  - [ ]* 7.6 Write property test for confidence threshold
    - **Property 1: Router confidence threshold enforcement**
    - Use fast-check to generate random confidence values; verify < 0.7 always routes to general
    - **Validates: Requirements 2.4, 8.2**

  - [ ]* 7.7 Write property test for discount policy enforcement
    - **Property 3: Discount policy enforcement**
    - Use fast-check to generate random discount values and policy limits; verify never exceeds max
    - **Validates: Requirements 3.3, 3.4**

  - [ ]* 7.8 Write property test for reconciliation tolerance
    - **Property 4: Reconciliation tolerance boundary**
    - Use fast-check to generate random discrepancy amounts; verify correct auto-resolve vs escalate
    - **Validates: Requirements 5.2, 5.3**

  - [ ]* 7.9 Write integration test for full message routing flow
    - Test: sales message → SalesAgent processes → response
    - Test: ambiguous message → LLM classification → appropriate agent
    - Test: follow-up message → cache hit → same agent
    - Test: tenant without agent_config → GeneralAgent (backward compat)
    - _Requirements: 2.1, 2.5, 8.3, 9.5_

- [ ] 8. Final checkpoint — Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The GeneralAgent (4.1) is the MOST CRITICAL task — it ensures zero breaking changes
- InventoryAgent and FinanceAgent can be implemented after the core router + SalesAgent are working
- Redis cache is optional for MVP (router works without it, just slightly slower)
- The existing AiEngineService.processMessage() signature does NOT change — only internal routing logic

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4"] },
    { "id": 5, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.5"] },
    { "id": 7, "tasks": ["7.3", "7.4", "7.6", "7.7", "7.8"] },
    { "id": 8, "tasks": ["7.9"] }
  ]
}
```
