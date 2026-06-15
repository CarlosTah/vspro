# Requirements Document

## Introduction

The VSPRO Platform Agent is a "dogfooding" module where VSPRO uses its own platform to sell itself. A single WhatsApp number (and optionally Messenger/Instagram) serves as the commercial channel. The system operates in two modes: a Pre-Sales Agent that guides prospects through discovery, objection handling, and registration, and a Client Operations Agent that allows existing customers to query and operate their own tenant via conversational commands. The module lives in a dedicated "vspro-platform" tenant and uses cross-tenant read/write access for authenticated client operations.

## Glossary

- **Platform_Agent**: The overarching module that handles both pre-sales and client operations for VSPRO's own commercial channel
- **Pre_Sales_Agent**: The AI agent responsible for engaging prospects, explaining VSPRO features and pricing, handling objections, and guiding registration
- **Client_Ops_Agent**: The AI agent responsible for serving existing VSPRO customers by querying and operating their tenant data
- **Platform_Router**: The component that identifies whether an incoming message sender is a prospect or an existing client and routes to the appropriate agent
- **Platform_Tenant**: The special tenant with slug "vspro-platform" that stores pre-sales conversations, knowledge base, and platform agent configuration
- **Owner_Phone**: The phone number stored in the public tenants table (settings.ownerPhone) used to identify existing clients
- **Knowledge_Base**: A JSONB-stored repository of VSPRO features, plans, pricing, FAQs, use cases, and objection-handling scripts
- **Prospect**: A sender whose phone number does not match any Owner_Phone in the public tenants table
- **Existing_Client**: A sender whose phone number matches an Owner_Phone in the public tenants table
- **Cross_Tenant_Access**: The ability of Client_Ops_Agent to query data in the tenant schema belonging to the authenticated Existing_Client
- **Follow_Up_Job**: A scheduled BullMQ job that sends proactive messages to prospects who have not completed registration
- **Registration_Flow**: The process of creating a new VSPRO tenant via the existing OnboardingService
- **Conversion_Metrics**: Data tracking prospect interactions, trial sign-ups, and paid conversions

## Requirements

### Requirement 1: Platform Tenant Provisioning

**User Story:** As a VSPRO platform administrator, I want a dedicated "vspro-platform" tenant with its own schema, so that pre-sales conversations and platform agent data are isolated from customer tenants.

#### Acceptance Criteria

1. THE Platform_Tenant SHALL have the slug "vspro-platform" and a corresponding PostgreSQL schema "tenant_vspro_platform"
2. THE Platform_Tenant SHALL contain the standard tenant schema tables (conversations, messages, customers, ai_config)
3. THE Platform_Tenant SHALL store the Knowledge_Base in the ai_config.agent_config JSONB field
4. WHEN the Platform_Tenant does not exist during application startup, THE system SHALL provision the Platform_Tenant using the existing TenantProvisioningService

### Requirement 2: Sender Identification and Routing

**User Story:** As a VSPRO platform operator, I want incoming messages to be automatically routed to the correct agent mode based on the sender's identity, so that prospects get sales assistance and existing clients get operational support.

#### Acceptance Criteria

1. WHEN an incoming message arrives on the Platform_Tenant channel, THE Platform_Router SHALL query the public tenants table to determine if the sender's phone number matches any Owner_Phone
2. WHEN the sender's phone number matches an Owner_Phone, THE Platform_Router SHALL route the message to the Client_Ops_Agent with the matched tenant context
3. WHEN the sender's phone number does not match any Owner_Phone, THE Platform_Router SHALL route the message to the Pre_Sales_Agent
4. THE Platform_Router SHALL complete the sender identification lookup within 500ms
5. WHEN a sender's phone number matches multiple Owner_Phone entries, THE Platform_Router SHALL route to Client_Ops_Agent using the most recently active tenant

### Requirement 3: Pre-Sales Agent Knowledge

**User Story:** As a VSPRO sales manager, I want the Pre-Sales Agent to have complete knowledge of VSPRO's features, plans, and pricing, so that prospects receive accurate and compelling information.

#### Acceptance Criteria

1. THE Pre_Sales_Agent SHALL load plan information from the Knowledge_Base including: Básico at $49 MXN/month, Pro at $149 MXN/month, and Enterprise at $399 MXN/month
2. THE Pre_Sales_Agent SHALL respond to feature questions using information stored in the Knowledge_Base (channels supported, AI capabilities, billing, inventory, scheduling, reports)
3. THE Pre_Sales_Agent SHALL present use cases tailored to the prospect's business type when the business type is identified from conversation context
4. WHEN the Knowledge_Base is updated, THE Pre_Sales_Agent SHALL use the updated information in subsequent conversations without requiring a restart

### Requirement 4: Pre-Sales Conversational Flow

**User Story:** As a prospect messaging VSPRO's WhatsApp, I want to learn about the platform and sign up easily, so that I can decide if VSPRO is right for my business.

#### Acceptance Criteria

1. THE Pre_Sales_Agent SHALL respond in Spanish (Mexican dialect) with short, WhatsApp-appropriate messages
2. WHEN a prospect asks about pricing, THE Pre_Sales_Agent SHALL present the three plans with their key differentiators
3. WHEN a prospect raises a price objection, THE Pre_Sales_Agent SHALL respond with value-based arguments and mention the 14-day free trial
4. WHEN a prospect raises a complexity objection, THE Pre_Sales_Agent SHALL emphasize simplicity, WhatsApp-native operation, and 24/7 AI availability
5. WHEN a prospect raises a trust objection, THE Pre_Sales_Agent SHALL reference testimonials, number of active businesses, and the no-contract policy
6. WHEN a prospect expresses interest in signing up, THE Pre_Sales_Agent SHALL offer to guide them through registration or send a direct registration link
7. THE Pre_Sales_Agent SHALL identify the prospect's business type from conversational cues and adapt examples accordingly

### Requirement 5: Registration Flow Integration

**User Story:** As a prospect ready to sign up, I want to complete registration through the same WhatsApp conversation, so that I don't need to switch to a different interface.

#### Acceptance Criteria

1. WHEN a prospect confirms they want to register, THE Pre_Sales_Agent SHALL collect the minimum required data: business name, owner name, email, and password
2. WHEN all registration data is collected, THE Pre_Sales_Agent SHALL invoke the existing OnboardingService to create the new tenant
3. IF the chosen slug is already taken, THEN THE Pre_Sales_Agent SHALL inform the prospect and suggest alternatives
4. WHEN registration completes successfully, THE Pre_Sales_Agent SHALL send the prospect their webhook URL and next-step instructions
5. THE Pre_Sales_Agent SHALL also provide a registration link (URL to the web onboarding form) as an alternative to in-chat registration

### Requirement 6: Prospect Follow-Up

**User Story:** As a VSPRO sales manager, I want prospects who don't complete registration to receive follow-up messages, so that potential conversions are not lost.

#### Acceptance Criteria

1. WHEN a prospect conversation has been inactive for 24 hours and the prospect has not registered, THE Follow_Up_Job SHALL send a follow-up message
2. THE Follow_Up_Job SHALL send a maximum of 3 follow-up messages per prospect, spaced at 24 hours, 72 hours, and 7 days after last interaction
3. WHEN a prospect responds to a follow-up message, THE Pre_Sales_Agent SHALL resume the conversation from where it left off using conversation history
4. WHEN a prospect has received all 3 follow-up messages without responding, THE Follow_Up_Job SHALL mark the prospect as "cold" and stop outreach
5. THE Follow_Up_Job SHALL respect WhatsApp's 24-hour messaging window policy by using approved message templates for messages sent outside the window

### Requirement 7: Client Operations Agent Authentication

**User Story:** As an existing VSPRO client, I want to securely access my tenant's data through WhatsApp, so that only I can query and modify my business information.

#### Acceptance Criteria

1. THE Client_Ops_Agent SHALL only access the tenant schema belonging to the Existing_Client identified by Owner_Phone match
2. THE Client_Ops_Agent SHALL validate that the matched tenant has status "ACTIVE" or "TRIAL" before granting access
3. IF the matched tenant has status "SUSPENDED" or "CANCELLED", THEN THE Client_Ops_Agent SHALL inform the Existing_Client of their account status and provide support contact information
4. THE Cross_Tenant_Access SHALL use a read-only database connection for query operations
5. WHEN the Client_Ops_Agent performs a write operation (create order, trigger campaign), THE Cross_Tenant_Access SHALL use a write-enabled connection scoped to the authenticated tenant schema

### Requirement 8: Client Operations - Data Queries

**User Story:** As an existing VSPRO client, I want to ask natural-language questions about my business data, so that I can get quick insights without opening the dashboard.

#### Acceptance Criteria

1. WHEN an Existing_Client asks about sales totals, THE Client_Ops_Agent SHALL query the orders table in the client's tenant schema and return the aggregated amount
2. WHEN an Existing_Client asks about a specific order by order number, THE Client_Ops_Agent SHALL query the orders table and return the order status, items, and total
3. WHEN an Existing_Client asks about inventory or stock, THE Client_Ops_Agent SHALL query the products and inventory tables and return availability information
4. WHEN an Existing_Client asks about outstanding payments, THE Client_Ops_Agent SHALL query orders with status "payment_pending" and return the list with customer names and amounts
5. WHEN an Existing_Client asks about new customers, THE Client_Ops_Agent SHALL query the customers table filtered by the requested time period and return the count and names
6. WHEN an Existing_Client asks about best-selling products, THE Client_Ops_Agent SHALL query the orders table, aggregate items sold, and return a ranked list

### Requirement 9: Client Operations - Write Actions

**User Story:** As an existing VSPRO client, I want to create orders and trigger campaigns through WhatsApp, so that I can operate my business on the go.

#### Acceptance Criteria

1. WHEN an Existing_Client requests order creation with product and customer details, THE Client_Ops_Agent SHALL create the order in the client's tenant schema using the existing order creation logic
2. WHEN an Existing_Client requests a win-back campaign trigger, THE Client_Ops_Agent SHALL activate the specified retention campaign in the client's tenant
3. WHEN the Client_Ops_Agent creates an order, THE Client_Ops_Agent SHALL confirm the order details with the Existing_Client before committing
4. THE Client_Ops_Agent SHALL respond in Spanish (Mexican dialect) with concise, WhatsApp-appropriate messages
5. IF a write operation fails, THEN THE Client_Ops_Agent SHALL inform the Existing_Client of the error reason and suggest corrective action

### Requirement 10: Multi-Channel Support

**User Story:** As a VSPRO platform operator, I want the Platform Agent to work across WhatsApp, Messenger, and Instagram, so that prospects and clients can reach VSPRO on their preferred channel.

#### Acceptance Criteria

1. THE Platform_Tenant SHALL support channel configuration for WhatsApp, Messenger, and Instagram
2. WHEN a message arrives via Messenger or Instagram, THE Platform_Router SHALL perform the same sender identification logic using the channel-specific customer identifier mapped to a phone number in the customers table
3. THE Pre_Sales_Agent and Client_Ops_Agent SHALL produce channel-appropriate message formats (text length limits, media support) based on the incoming channel type

### Requirement 11: Rate Limiting and Security

**User Story:** As a VSPRO platform operator, I want rate limiting and security controls on the Platform Agent, so that the system is protected from abuse and unauthorized access.

#### Acceptance Criteria

1. THE Platform_Agent SHALL enforce a rate limit of 30 messages per minute per sender
2. IF a sender exceeds the rate limit, THEN THE Platform_Agent SHALL respond with a polite message asking them to wait and silently drop excess messages
3. THE Client_Ops_Agent SHALL log all Cross_Tenant_Access operations in the Platform_Tenant audit trail
4. THE Client_Ops_Agent SHALL restrict data access exclusively to the tenant matched by the authenticated sender's Owner_Phone
5. WHEN a Client_Ops_Agent tool execution takes longer than 10 seconds, THE Client_Ops_Agent SHALL return a timeout message and log the slow query

### Requirement 12: Conversion Metrics and Analytics

**User Story:** As a VSPRO platform manager, I want to track conversion metrics for the pre-sales funnel, so that I can optimize the sales process and measure ROI.

#### Acceptance Criteria

1. THE Platform_Agent SHALL record the following Conversion_Metrics: total prospect conversations, prospects who asked about pricing, prospects who started registration, completed registrations, and trial-to-paid conversions
2. THE Platform_Agent SHALL track Client_Ops_Agent usage metrics: queries per client per day, most common query types, and write operations performed
3. WHEN a prospect completes registration, THE Platform_Agent SHALL attribute the conversion to the originating conversation and channel
4. THE Conversion_Metrics SHALL be queryable via the VSPRO super-admin dashboard

### Requirement 13: Webhook Endpoint Configuration

**User Story:** As a VSPRO platform operator, I want the Platform Agent to receive messages through the existing Meta webhook infrastructure, so that no separate webhook system is needed.

#### Acceptance Criteria

1. THE Platform_Tenant SHALL receive Meta webhook events at the endpoint path "/webhooks/meta/vspro-platform"
2. WHEN a webhook event arrives for the "vspro-platform" slug, THE existing WebhooksModule SHALL process the event using the Platform_Tenant context
3. THE webhook endpoint SHALL validate the Meta signature using the Platform_Tenant's configured verify token
