# Requirements Document

## Introduction

Win-Back Automation Retention Module for VSPRO: A configurable campaign-based system for automatically re-engaging inactive customers across WhatsApp, Messenger, and Instagram. This module extends the existing loyalty segmentation infrastructure with persistent RetentionCampaign entities, a dedicated BullMQ worker (WinBackWorker on the "loyalty" queue), and an AI tool (execute_reengagement_campaign) that allows AI agents to trigger campaigns programmatically. Campaigns define trigger thresholds (days since last order, spending drop percentage, engagement score), automatically identify matching customers using tenant-isolated schema queries, execute personalized outreach through the multi-agent AI system, and track performance metrics (sent, opened, converted, revenue recovered). The module supports A/B testing of message variants, respects Meta's 24-hour messaging window, and provides a REST API for campaign CRUD from the tenant dashboard.

## Glossary

- **Retention_Module**: The NestJS module encapsulating all win-back automation functionality including the controller, service, worker, and cron scheduler
- **RetentionCampaign**: The primary data model stored in the tenant schema representing a configured win-back campaign with fields: id, name, target_segment, trigger_threshold (JSONB), status (enum), schedule_cron, message_variants, metrics, created_at, updated_at, last_run
- **WinBackWorker**: The BullMQ job processor registered on the "loyalty" queue responsible for evaluating campaign criteria, identifying target customers, and orchestrating re-engagement message delivery
- **Trigger_Threshold**: A JSONB object defining the conditions that qualify a customer for a campaign, supporting keys: days_since_last_order (integer), spending_drop_percent (number 0-100), engagement_score_below (number 0-100), min_lifetime_value (decimal), and max_contacts_last_30d (integer)
- **Campaign_Status**: An enumeration representing the lifecycle state of a RetentionCampaign with values: draft, active, paused, completed
- **Target_Segment**: A string field on RetentionCampaign referencing a customer segment from the loyalty segmentation engine (at_risk, churned, vip, active, new, inactive)
- **Campaign_Execution**: A single run of a campaign that evaluates criteria, selects customers, and dispatches personalized messages
- **Message_Variant**: A JSONB array entry on RetentionCampaign containing a named message template with tone, content template, and optional discount code for A/B testing
- **Campaign_Metrics**: A JSONB object on RetentionCampaign tracking: total_sent, total_opened, total_converted, revenue_recovered, and per-variant breakdowns
- **Execute_Reengagement_Campaign_Tool**: The AI function-calling tool registered with the agent system that allows AI agents to trigger a specific campaign on-demand
- **Messaging_Window**: The 24-hour period after the last inbound customer message during which the business can send free-form messages via Meta APIs
- **Template_Message**: A pre-approved Meta WhatsApp message template used for outreach outside the 24-hour messaging window
- **Campaign_Contact_Log**: A record in the tenant schema tracking each individual outreach attempt with customer_id, campaign_id, variant_used, channel, status (sent/opened/converted), sent_at, and converted_at
- **Tenant_Schema**: The PostgreSQL schema belonging to a specific tenant containing all business data tables, accessed via schema-per-tenant isolation

## Requirements

### Requirement 1: RetentionCampaign Data Model

**User Story:** As a business owner, I want to define win-back campaigns with configurable trigger thresholds, so that I can target specific inactive customer segments with tailored re-engagement strategies.

#### Acceptance Criteria

1. THE Retention_Module SHALL create a `retention_campaigns` table in the tenant schema with columns: id (UUID, PK), name (VARCHAR 255, NOT NULL), target_segment (VARCHAR 100, NOT NULL), trigger_threshold (JSONB, NOT NULL), status (VARCHAR 50, NOT NULL, DEFAULT 'draft'), schedule_cron (VARCHAR 100), message_variants (JSONB, NOT NULL, DEFAULT '[]'), metrics (JSONB, NOT NULL, DEFAULT '{}'), created_at (TIMESTAMPTZ, DEFAULT NOW()), updated_at (TIMESTAMPTZ, DEFAULT NOW()), last_run (TIMESTAMPTZ)
2. THE Retention_Module SHALL create a force index on the `target_segment` column of the `retention_campaigns` table
3. THE Retention_Module SHALL create a `campaign_contact_logs` table in the tenant schema with columns: id (UUID, PK), campaign_id (UUID, FK to retention_campaigns), customer_id (UUID, FK to customers), variant_used (VARCHAR 100), channel (VARCHAR 50, NOT NULL), status (VARCHAR 50, NOT NULL, DEFAULT 'sent'), sent_at (TIMESTAMPTZ, NOT NULL, DEFAULT NOW()), opened_at (TIMESTAMPTZ), converted_at (TIMESTAMPTZ), revenue_amount (DECIMAL 10,2)
4. THE Retention_Module SHALL create an index on `campaign_contact_logs(campaign_id)` and a composite index on `campaign_contact_logs(customer_id, sent_at DESC)` for efficient lookups
5. THE Retention_Module SHALL restrict the `status` column to the values: draft, active, paused, completed

### Requirement 2: Campaign Lifecycle Management

**User Story:** As a business owner, I want to manage my campaigns through a defined lifecycle, so that I can prepare, activate, pause, and complete campaigns in a controlled manner.

#### Acceptance Criteria

1. WHEN a RetentionCampaign is created, THE Retention_Module SHALL set the initial status to 'draft'
2. WHEN a user transitions a campaign from 'draft' to 'active', THE Retention_Module SHALL validate that the campaign has at least one message variant and a valid trigger_threshold before allowing the transition
3. WHEN a user transitions a campaign to 'paused', THE Retention_Module SHALL stop scheduling new executions for that campaign while preserving all existing metrics
4. WHEN a user transitions a campaign to 'completed', THE Retention_Module SHALL prevent further executions and mark the campaign as finalized
5. IF a user attempts an invalid status transition (e.g., draft to completed, or completed to active), THEN THE Retention_Module SHALL reject the request with an error message describing the valid transitions
6. THE Retention_Module SHALL support the following valid transitions: draft→active, active→paused, paused→active, active→completed, paused→completed

### Requirement 3: Trigger Threshold Evaluation

**User Story:** As a business owner, I want the system to automatically identify customers matching my campaign criteria, so that outreach reaches the right people at the right time.

#### Acceptance Criteria

1. WHEN the WinBackWorker evaluates a campaign, THE WinBackWorker SHALL query the tenant schema to identify customers in the target_segment whose behavior matches all conditions specified in the trigger_threshold JSONB
2. WHEN trigger_threshold contains `days_since_last_order`, THE WinBackWorker SHALL select customers whose last order was placed at least that many days ago
3. WHEN trigger_threshold contains `spending_drop_percent`, THE WinBackWorker SHALL select customers whose spending in the last 30 days is at least that percentage below their average 30-day spending over the prior 90 days
4. WHEN trigger_threshold contains `engagement_score_below`, THE WinBackWorker SHALL select customers whose engagement score (based on message response rate in the last 30 days) is below the specified value
5. WHEN trigger_threshold contains `min_lifetime_value`, THE WinBackWorker SHALL select only customers whose total lifetime order value equals or exceeds the specified amount
6. WHEN trigger_threshold contains `max_contacts_last_30d`, THE WinBackWorker SHALL exclude customers who have already received more than the specified number of campaign contacts in the last 30 days
7. THE WinBackWorker SHALL combine all trigger_threshold conditions with AND logic so that customers must satisfy every specified condition

### Requirement 4: WinBackWorker Job Processing

**User Story:** As a platform operator, I want a dedicated worker to process win-back campaigns reliably in the background, so that campaign execution does not block the main API.

#### Acceptance Criteria

1. THE WinBackWorker SHALL register on the existing "loyalty" BullMQ queue and process jobs with the type 'win-back-execution'
2. WHEN the WinBackWorker receives a campaign execution job, THE WinBackWorker SHALL load the RetentionCampaign from the tenant schema specified in the job payload
3. WHEN the WinBackWorker processes a campaign, THE WinBackWorker SHALL evaluate trigger thresholds, select matching customers, and enqueue individual message delivery jobs for each selected customer
4. IF the RetentionCampaign status is not 'active' at the time of processing, THEN THE WinBackWorker SHALL discard the job without executing
5. IF a job fails during processing, THEN THE WinBackWorker SHALL retry up to 3 times with exponential backoff starting at 60 seconds
6. THE WinBackWorker SHALL update the `last_run` timestamp on the RetentionCampaign after each successful execution
7. THE WinBackWorker SHALL validate that the tenant schema in the job payload belongs to the tenantId before executing any database query

### Requirement 5: Personalized Message Delivery

**User Story:** As a business owner, I want re-engagement messages to be personalized using customer context and AI, so that outreach feels natural and drives higher conversion.

#### Acceptance Criteria

1. WHEN the WinBackWorker delivers a message to a customer, THE WinBackWorker SHALL load customer memory (profile and recent episodes) from the tenant schema to build personalization context
2. WHEN the WinBackWorker delivers a message, THE WinBackWorker SHALL invoke the AI agent system with the selected message variant template and customer context to generate a personalized message
3. WHEN a campaign has multiple message variants, THE WinBackWorker SHALL randomly assign a variant to each customer for A/B testing purposes
4. WHEN a personalized message is generated, THE WinBackWorker SHALL deliver the message through the customer's original messaging channel (WhatsApp, Messenger, or Instagram)
5. WHEN a message is successfully sent, THE WinBackWorker SHALL create a Campaign_Contact_Log record with the customer_id, campaign_id, variant_used, channel, and sent_at timestamp

### Requirement 6: Meta 24-Hour Messaging Window Compliance

**User Story:** As a business owner, I want the system to respect Meta's messaging window rules, so that my messaging accounts remain compliant and avoid penalties.

#### Acceptance Criteria

1. WHEN the WinBackWorker prepares to send a message to a customer, THE WinBackWorker SHALL calculate the elapsed time since the last inbound message from that customer
2. WHILE the elapsed time since the last inbound message is less than or equal to 24 hours, THE WinBackWorker SHALL send the AI-generated personalized free-form message directly
3. WHEN the elapsed time since the last inbound message exceeds 24 hours, THE WinBackWorker SHALL send a pre-approved Template_Message instead of the free-form message
4. IF no Template_Message is configured for the campaign, THEN THE WinBackWorker SHALL skip the customer contact and log a warning indicating the reason
5. THE WinBackWorker SHALL include the campaign discount code (if present in the message variant) as a template parameter when sending a Template_Message

### Requirement 7: A/B Testing

**User Story:** As a business owner, I want to test different message approaches within a campaign, so that I can identify which messaging strategy drives the highest conversion.

#### Acceptance Criteria

1. THE Retention_Module SHALL support up to 5 message variants per RetentionCampaign, each containing: variant_name (string), content_template (string), tone (string), and optional discount_code (string)
2. WHEN the WinBackWorker assigns variants to customers, THE WinBackWorker SHALL distribute variants with approximately equal probability across the customer population
3. THE Retention_Module SHALL track metrics independently for each variant including: sent_count, opened_count, converted_count, and revenue_recovered
4. THE Campaign_Metrics SHALL include a per-variant breakdown alongside aggregate campaign totals
5. WHEN a user requests campaign performance via the REST API, THE Retention_Module SHALL return per-variant metrics sorted by conversion rate descending

### Requirement 8: Campaign Performance Tracking

**User Story:** As a business owner, I want to see how my win-back campaigns are performing, so that I can make data-driven decisions about retention strategies.

#### Acceptance Criteria

1. WHEN a message is delivered to a customer, THE Retention_Module SHALL increment the campaign metrics `total_sent` counter and the corresponding variant `sent_count`
2. WHEN a customer opens a conversation within 48 hours after receiving a campaign message, THE Retention_Module SHALL increment the `total_opened` counter and update the Campaign_Contact_Log `opened_at` timestamp
3. WHEN a customer places an order within 7 days after receiving a campaign message, THE Retention_Module SHALL increment the `total_converted` counter, add the order total to `revenue_recovered`, and update the Campaign_Contact_Log with `converted_at` and `revenue_amount`
4. THE Retention_Module SHALL update the campaign `metrics` JSONB field after each metric event
5. THE Retention_Module SHALL expose campaign metrics including: total_sent, total_opened, total_converted, revenue_recovered, open_rate (opened/sent), conversion_rate (converted/sent), and average_revenue_per_conversion

### Requirement 9: Cron-Based Campaign Scheduling

**User Story:** As a business owner, I want campaigns to execute automatically on a schedule, so that I do not need to manually trigger each campaign run.

#### Acceptance Criteria

1. THE Retention_Module SHALL provide a Campaign_Scheduler that scans for active campaigns with a `schedule_cron` field every minute
2. WHEN the Campaign_Scheduler finds an active campaign whose cron expression indicates it is due for execution, THE Campaign_Scheduler SHALL enqueue a 'win-back-execution' job on the "loyalty" queue with the campaign_id and tenant context
3. THE Campaign_Scheduler SHALL prevent duplicate executions by comparing the current time against the `last_run` timestamp and the cron interval
4. THE Campaign_Scheduler SHALL process tenants independently so that a failure in one tenant does not block scheduling for other tenants
5. WHEN a campaign does not specify a `schedule_cron`, THE Retention_Module SHALL treat it as a manual-only campaign that executes only when triggered via API or AI tool

### Requirement 10: AI Tool Integration

**User Story:** As a business owner, I want my AI agents to trigger win-back campaigns on my behalf via conversation, so that I can manage retention without accessing the dashboard.

#### Acceptance Criteria

1. THE Retention_Module SHALL register an `execute_reengagement_campaign` tool with the AI agent system as an OpenAI function-calling tool
2. THE Execute_Reengagement_Campaign_Tool SHALL accept parameters: campaign_id (required, string) and override_segment (optional, string)
3. WHEN an AI agent invokes the Execute_Reengagement_Campaign_Tool, THE Retention_Module SHALL validate the campaign_id exists and belongs to the current tenant schema
4. WHEN the Execute_Reengagement_Campaign_Tool is invoked on a campaign with status 'active', THE Retention_Module SHALL enqueue an immediate 'win-back-execution' job on the "loyalty" queue
5. IF the Execute_Reengagement_Campaign_Tool is invoked on a campaign that is not 'active', THEN THE Retention_Module SHALL return an error message to the AI agent indicating the campaign must be activated first
6. WHEN the Execute_Reengagement_Campaign_Tool completes successfully, THE Retention_Module SHALL return a confirmation message including the campaign name and estimated target count

### Requirement 11: REST API for Campaign CRUD

**User Story:** As a business admin, I want REST endpoints to manage campaigns from the dashboard, so that I can create, update, and monitor campaigns without technical knowledge.

#### Acceptance Criteria

1. THE Retention_Module SHALL expose a POST `/retention/campaigns` endpoint that creates a new RetentionCampaign in draft status with the provided name, target_segment, trigger_threshold, and message_variants
2. THE Retention_Module SHALL expose a GET `/retention/campaigns` endpoint that returns all campaigns for the authenticated tenant with pagination support (limit, offset)
3. THE Retention_Module SHALL expose a GET `/retention/campaigns/:id` endpoint that returns a single campaign including its current metrics and contact log summary
4. THE Retention_Module SHALL expose a PATCH `/retention/campaigns/:id` endpoint that updates mutable campaign fields (name, target_segment, trigger_threshold, message_variants, schedule_cron) only when the campaign status is 'draft' or 'paused'
5. THE Retention_Module SHALL expose a POST `/retention/campaigns/:id/activate` endpoint that transitions the campaign to 'active' status after validation
6. THE Retention_Module SHALL expose a POST `/retention/campaigns/:id/pause` endpoint that transitions the campaign to 'paused' status
7. THE Retention_Module SHALL expose a POST `/retention/campaigns/:id/complete` endpoint that transitions the campaign to 'completed' status
8. THE Retention_Module SHALL expose a POST `/retention/campaigns/:id/execute` endpoint that triggers an immediate campaign execution for active campaigns
9. THE Retention_Module SHALL validate all request payloads using DTOs with class-validator decorators and return 400 errors for invalid input

### Requirement 12: Tenant Isolation

**User Story:** As a platform operator, I want strict tenant isolation in the retention module, so that no tenant can access or affect another tenant's campaigns or customer data.

#### Acceptance Criteria

1. THE Retention_Module SHALL create retention_campaigns and campaign_contact_logs tables exclusively within the tenant schema, not in the public schema
2. THE WinBackWorker SHALL validate that the tenant schema in the job payload corresponds to the tenantId before executing any database operation
3. THE Campaign_Scheduler SHALL query each tenant schema using schema names derived from the platform tenants registry in the public schema
4. FOR ALL retention module operations, THE Retention_Module SHALL execute database queries exclusively within the tenant schema specified by the authenticated request or job payload
5. THE REST API endpoints SHALL use the TenantMiddleware to resolve the tenant context and restrict all queries to the authenticated tenant's schema
6. IF the WinBackWorker receives a job with a schema name that does not match the tenantId ownership, THEN THE WinBackWorker SHALL reject the job and log a security warning

### Requirement 13: Contact Frequency Limiting

**User Story:** As a business owner, I want to prevent over-contacting customers with win-back messages, so that outreach remains effective and customers do not feel spammed.

#### Acceptance Criteria

1. WHEN the WinBackWorker selects customers for a campaign execution, THE WinBackWorker SHALL exclude customers who have received a campaign message from any campaign within the last 7 days
2. WHEN the WinBackWorker selects customers for a campaign execution, THE WinBackWorker SHALL exclude customers who have received more than 3 campaign messages in the last 30 days
3. THE Retention_Module SHALL use the campaign_contact_logs table to determine contact history for frequency evaluation
4. IF all eligible customers for a campaign have been excluded by frequency limits, THEN THE WinBackWorker SHALL log that the campaign execution produced zero targets and update the last_run timestamp without error
