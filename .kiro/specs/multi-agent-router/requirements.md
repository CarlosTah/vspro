# Requirements Document

## Introduction

Evolución del monolítico `AiEngineService` hacia una arquitectura de multi-agentes especializados con enrutamiento por clasificación de intención. El sistema descompone el procesamiento de mensajes en agentes con prompts y herramientas optimizadas por dominio (ventas, inventario, finanzas), coordinados por un router inteligente que clasifica la intención del mensaje entrante. Se mantiene compatibilidad total con el comportamiento actual mediante un GeneralAgent como fallback.

## Glossary

- **Agent_Router**: Servicio que clasifica la intención de un mensaje entrante y lo enruta al agente especializado apropiado
- **Base_Agent**: Clase abstracta que define la interfaz común para todos los agentes especializados (nombre, prompt, herramientas, método process)
- **Sales_Agent**: Agente especializado en conversión y cierre de ventas, manejo de objeciones de precio y upselling
- **Inventory_Agent**: Agente autónomo basado en cron que monitorea niveles de stock y genera borradores de pedidos a proveedores
- **Finance_Agent**: Agente de conciliación que cruza pagos verificados por OCR contra eventos de webhook de Stripe
- **General_Agent**: Agente fallback que encapsula el comportamiento actual del AiEngineService monolítico
- **Intent_Classification**: Proceso de determinar la categoría de intención de un mensaje (sales, inventory, finance, support, general)
- **Commercial_Policies**: Configuración por tenant que define descuentos máximos, promociones activas y reglas de negocio para el Sales_Agent
- **Confidence_Score**: Valor numérico (0.0–1.0) que indica la certeza del Agent_Router sobre la clasificación de intención
- **Reconciliation_Tolerance**: Monto máximo de discrepancia que el Finance_Agent puede auto-resolver sin escalación (default ≤$5 MXN)
- **Supplier_Info**: Campo JSONB en la tabla products que almacena datos de contacto y condiciones del proveedor
- **Agent_Config**: Campo JSONB en la tabla ai_config que almacena la configuración de agentes habilitados, modelos y temperaturas por tenant
- **Tenant**: Organización cliente del SaaS con schema PostgreSQL aislado

## Requirements

### Requirement 1: Base Agent Abstraction

**User Story:** As a developer, I want a common abstract class for all agents, so that each agent follows a consistent interface and can be extended independently.

#### Acceptance Criteria

1. THE Base_Agent SHALL define the properties: name (string), systemPrompt (string), tools (array of tool definitions), and a process() method
2. WHEN a new agent class extends Base_Agent, THE new agent SHALL implement all abstract properties and the process() method
3. THE Base_Agent SHALL provide access to CustomerMemoryService for building memory context within the process() method
4. THE Base_Agent SHALL accept an AgentContext parameter containing conversation history, tenant configuration, schema name, and customer identifier

### Requirement 2: Agent Router Intent Classification

**User Story:** As a system operator, I want incoming messages classified by intent, so that each message is handled by the most appropriate specialized agent.

#### Acceptance Criteria

1. WHEN a message is received, THE Agent_Router SHALL first attempt classification using heuristic rules (keyword matching and conversation order state)
2. WHEN heuristic classification is inconclusive, THE Agent_Router SHALL fall back to LLM-based classification using gpt-4o-mini
3. THE Agent_Router SHALL return a Confidence_Score between 0.0 and 1.0 for each classification
4. WHEN the Confidence_Score is below 0.7, THE Agent_Router SHALL route the message to the General_Agent
5. WHEN a conversation already has a cached intent classification, THE Agent_Router SHALL reuse the cached intent for follow-up messages in the same conversation
6. THE Agent_Router SHALL invalidate the cached intent WHEN the conversation context changes significantly (new order state, explicit topic change detected)
7. THE Agent_Router SHALL classify intents into one of: sales, inventory, finance, support, or general

### Requirement 3: Sales Agent Conversion Optimization

**User Story:** As a business owner, I want an agent specialized in closing sales, so that conversion rates improve through optimized objection handling and proactive follow-ups.

#### Acceptance Criteria

1. WHEN a message with sales intent is routed to the Sales_Agent, THE Sales_Agent SHALL use a system prompt optimized for conversion and closing
2. THE Sales_Agent SHALL have exclusive access to tools: create_order, apply_discount, check_product_availability, and suggest_upsell
3. WHEN a price objection is detected, THE Sales_Agent SHALL consult the tenant Commercial_Policies to determine the maximum allowable discount
4. THE Sales_Agent SHALL enforce the max_discount_percent defined in Commercial_Policies and refuse discounts exceeding that limit
5. WHEN a customer hesitates for more than one exchange without commitment, THE Sales_Agent SHALL trigger a proactive follow-up using schedule_follow_up with contextual reason
6. WHERE a tenant has active_promotions configured, THE Sales_Agent SHALL reference applicable promotions in responses to price objections

### Requirement 4: Inventory Agent Autonomous Monitoring

**User Story:** As a business owner, I want automated stock monitoring, so that low-stock items are detected and supplier reorder drafts are generated without manual intervention.

#### Acceptance Criteria

1. THE Inventory_Agent SHALL execute on a cron schedule every 6 hours, scanning all active tenant schemas
2. WHEN a product has stock_available below stock_minimum, THE Inventory_Agent SHALL flag that product as requiring reorder
3. WHEN flagged products are detected, THE Inventory_Agent SHALL read the Supplier_Info field from the products table to obtain supplier contact details
4. THE Inventory_Agent SHALL generate a supplier email draft containing: product name, SKU, current stock, recommended reorder quantity, and supplier contact
5. THE Inventory_Agent SHALL enqueue the generated draft for admin review and approval before sending
6. IF the Supplier_Info field is empty or missing for a flagged product, THEN THE Inventory_Agent SHALL create an alert notifying the admin that supplier information is needed

### Requirement 5: Finance Agent Payment Reconciliation

**User Story:** As a business owner, I want automated payment reconciliation, so that discrepancies between OCR-verified payments and Stripe transactions are detected and resolved efficiently.

#### Acceptance Criteria

1. WHEN a Stripe webhook event (charge.succeeded) is received, THE Finance_Agent SHALL attempt to match the event against existing payments in the payments table using order reference
2. WHEN a match is found and the discrepancy is within the Reconciliation_Tolerance (default ≤$5 MXN), THE Finance_Agent SHALL auto-reconcile the payment and mark it as reconciled with an adjustment note
3. WHEN a match is found and the discrepancy exceeds the Reconciliation_Tolerance, THE Finance_Agent SHALL escalate the discrepancy to the admin with full details (expected amount, received amount, order reference)
4. THE Finance_Agent SHALL execute a daily cron reconciliation pass to catch unmatched payments older than 24 hours
5. THE Finance_Agent SHALL log all reconciliation actions (auto-resolved and escalated) in an auditable format
6. IF no matching payment record is found for a Stripe event, THEN THE Finance_Agent SHALL create an alert for manual review

### Requirement 6: Tenant Agent Configuration

**User Story:** As a tenant administrator, I want to configure which agents are enabled and their parameters, so that the AI behavior matches my business needs.

#### Acceptance Criteria

1. THE System SHALL store agent configuration in the Agent_Config JSONB field within the ai_config table
2. THE Agent_Config SHALL support per-agent settings: enabled (boolean), model (string), and temperature (number)
3. WHEN an agent is disabled in Agent_Config for a tenant, THE Agent_Router SHALL skip that agent during classification and route to General_Agent instead
4. THE Agent_Config SHALL include a commercial_policies object with: max_discount_percent, first_purchase_discount, and active_promotions array
5. WHEN Agent_Config is not present for a tenant, THE System SHALL use default configuration (Sales_Agent and General_Agent enabled, others disabled)
6. THE System SHALL validate Agent_Config values on update (temperature between 0.0 and 2.0, max_discount_percent between 0 and 50)

### Requirement 7: Database Schema Extensions

**User Story:** As a developer, I want the necessary database fields added, so that agents can store and retrieve their configuration and operational data.

#### Acceptance Criteria

1. THE System SHALL add a supplier_info JSONB field to the products table with default value '{}'
2. THE supplier_info field SHALL support storing: supplier_name, supplier_email, supplier_phone, lead_time_days, and minimum_order_quantity
3. THE System SHALL add an agent_config JSONB field to the ai_config table with a default configuration enabling Sales_Agent and General_Agent
4. THE System SHALL create the schema migration as backward-compatible (ADD COLUMN IF NOT EXISTS with defaults, no data loss)

### Requirement 8: Backward Compatibility and Fallback

**User Story:** As a system operator, I want the existing behavior preserved, so that the multi-agent refactoring introduces no breaking changes for current tenants.

#### Acceptance Criteria

1. THE General_Agent SHALL encapsulate the current AiEngineService behavior including all existing tools and the current system prompt logic
2. WHEN the Agent_Router cannot classify with confidence above 0.7, THE System SHALL route to the General_Agent
3. WHEN a tenant has no Agent_Config defined, THE System SHALL behave identically to the current monolithic AiEngineService
4. THE existing API contract (processMessage input/output) SHALL remain unchanged after the refactoring
5. THE existing custom_tools functionality from AiToolsExtenderService SHALL continue to work within the General_Agent context

### Requirement 9: Router Performance and Cost Optimization

**User Story:** As a system operator, I want the routing layer to be fast and cost-effective, so that the multi-agent architecture does not degrade response times or increase costs significantly.

#### Acceptance Criteria

1. THE Agent_Router SHALL use gpt-4o-mini for LLM-based classification to minimize cost and latency
2. THE Agent_Router SHALL cache intent classification per conversation in Redis to avoid redundant LLM calls on follow-up messages
3. WHEN heuristic classification succeeds, THE Agent_Router SHALL skip the LLM call entirely, resulting in near-zero additional latency
4. THE Agent_Router SHALL complete intent classification (heuristic + LLM fallback) within 200ms for 95th percentile of requests
5. WHEN a cached intent exists and is still valid, THE Agent_Router SHALL resolve routing within 5ms (Redis lookup only)
