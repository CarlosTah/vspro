# Requirements Document

## Introduction

Background Triggers y Proactividad IA: Architecture for proactive AI outreach in VSPRO. This feature enables the AI assistant to autonomously follow up with customers based on conversation context, respecting Meta's 24-hour messaging window and maintaining strict multi-tenant isolation. The system uses a cron-based scanner to detect due follow-ups across all tenant schemas, enqueues jobs into a BullMQ queue with tenant isolation, and processes them through a dedicated worker that generates contextual proactive messages using customer memory and conversation history.

## Glossary

- **Proactivity_Worker**: The BullMQ job processor responsible for consuming proactive outreach jobs from the queue and orchestrating message generation and delivery
- **Cron_Scanner**: A scheduled service that runs every minute to identify conversations with due follow-ups across all tenant schemas
- **Follow_Up_Scheduler**: The component responsible for setting the next_follow_up_at timestamp on a conversation when the AI determines a follow-up is needed
- **Messaging_Window**: The 24-hour period after the last inbound customer message during which the business can send free-form messages via Meta WhatsApp API
- **Template_Message**: A pre-approved Meta WhatsApp message template used for outreach outside the 24-hour messaging window
- **Proactive_Outreach_Queue**: The BullMQ queue named 'proactive-outreach' that holds tenant-isolated jobs for proactive message delivery
- **Tenant_Schema**: The PostgreSQL schema belonging to a specific tenant, containing all business data tables including conversations and customer_memories
- **AiEngine_Service**: The existing NestJS service that processes messages using GPT-4o with function calling and customer memory context
- **Conversation**: A record in the tenant schema representing an ongoing communication thread with a customer, containing status, context, and timing metadata

## Requirements

### Requirement 1: Schema Migration

**User Story:** As a platform operator, I want the conversations table to include a next_follow_up_at column, so that the system can track when proactive outreach is due for each conversation.

#### Acceptance Criteria

1. THE Schema_Migration SHALL add a `next_follow_up_at` column of type TIMESTAMPTZ with a default value of NULL to the conversations table in the tenant schema definition
2. THE Schema_Migration SHALL create an index on the `next_follow_up_at` column filtered to non-null values for efficient scanning of due follow-ups
3. THE Schema_Migration SHALL preserve all existing data in the conversations table without modification

### Requirement 2: Follow-Up Scheduling

**User Story:** As a business owner, I want the AI to automatically schedule follow-ups when conversation context warrants it, so that customers receive timely proactive outreach without manual intervention.

#### Acceptance Criteria

1. WHEN the AiEngine_Service determines a follow-up is needed, THE Follow_Up_Scheduler SHALL set the `next_follow_up_at` field on the conversation to the specified future timestamp
2. THE Follow_Up_Scheduler SHALL expose a `schedule_follow_up` tool to the AI with parameters for delay duration and reason
3. WHEN a new inbound message is received on a conversation with a pending follow-up, THE Follow_Up_Scheduler SHALL clear the existing `next_follow_up_at` value
4. THE Follow_Up_Scheduler SHALL validate that the scheduled timestamp is between 1 hour and 7 days in the future
5. WHEN the AI calls `schedule_follow_up` with an invalid delay, THE Follow_Up_Scheduler SHALL return an error message describing the valid range

### Requirement 3: Cron Scanner

**User Story:** As a platform operator, I want a background process to scan for due follow-ups across all tenants, so that proactive outreach jobs are enqueued reliably and on time.

#### Acceptance Criteria

1. THE Cron_Scanner SHALL execute every 60 seconds
2. WHEN the Cron_Scanner executes, THE Cron_Scanner SHALL query all active tenant schemas for conversations where `next_follow_up_at` is less than or equal to the current time and `status` equals 'active'
3. THE Cron_Scanner SHALL process each tenant schema independently so that a failure in one tenant does not block scanning of other tenants
4. WHEN the Cron_Scanner finds due conversations, THE Cron_Scanner SHALL set `next_follow_up_at` to NULL atomically in the same query to prevent duplicate job creation
5. THE Cron_Scanner SHALL log the count of enqueued jobs per scan cycle for observability

### Requirement 4: Job Enqueueing

**User Story:** As a platform operator, I want due follow-ups to be enqueued as isolated BullMQ jobs, so that they are processed reliably with tenant context preserved.

#### Acceptance Criteria

1. WHEN the Cron_Scanner identifies a due conversation, THE Cron_Scanner SHALL enqueue a job in the Proactive_Outreach_Queue with payload containing tenantId, schemaName, conversationId, and customerId
2. THE Proactive_Outreach_Queue SHALL use the tenantId as the job group identifier to prevent cross-tenant job interference
3. IF a job fails during processing, THEN THE Proactive_Outreach_Queue SHALL retry the job up to 3 times with exponential backoff starting at 30 seconds
4. THE Proactive_Outreach_Queue SHALL set a maximum job age of 1 hour after which unprocessed jobs are discarded

### Requirement 5: Proactivity Worker Processing

**User Story:** As a business owner, I want proactive messages to be generated using full customer context, so that outreach feels personalized and relevant.

#### Acceptance Criteria

1. WHEN the Proactivity_Worker receives a job, THE Proactivity_Worker SHALL validate that the schemaName in the job payload corresponds to the tenantId before processing
2. WHEN the Proactivity_Worker processes a job, THE Proactivity_Worker SHALL load the conversation history and customer memory context from the tenant schema
3. WHEN the Proactivity_Worker processes a job, THE Proactivity_Worker SHALL invoke AiEngine_Service to generate a proactive message using the loaded context and a proactive outreach system prompt
4. WHEN the AiEngine_Service generates a proactive message, THE Proactivity_Worker SHALL deliver the message through the conversation's original messaging channel
5. IF the conversation status has changed to a non-active state between enqueueing and processing, THEN THE Proactivity_Worker SHALL discard the job without sending a message

### Requirement 6: 24-Hour Messaging Window Enforcement

**User Story:** As a business owner, I want the system to respect Meta's messaging window rules, so that my WhatsApp Business account remains compliant and avoids penalties.

#### Acceptance Criteria

1. WHEN the Proactivity_Worker prepares to send a message, THE Proactivity_Worker SHALL calculate the elapsed time since the last inbound message (last_message_at) on the conversation
2. WHILE the elapsed time since last_message_at is less than or equal to 24 hours, THE Proactivity_Worker SHALL send the AI-generated free-form message directly
3. WHEN the elapsed time since last_message_at exceeds 24 hours, THE Proactivity_Worker SHALL send a pre-approved Template_Message instead of the free-form message
4. IF no Template_Message is configured for the tenant, THEN THE Proactivity_Worker SHALL skip the outreach and log a warning indicating the reason
5. IF last_message_at is NULL on the conversation, THEN THE Proactivity_Worker SHALL skip the outreach and log a warning

### Requirement 7: Rate Limiting

**User Story:** As a business owner, I want to prevent excessive proactive messages to customers, so that outreach remains effective without being intrusive.

#### Acceptance Criteria

1. THE Proactivity_Worker SHALL enforce a maximum of 1 proactive message per conversation within any 24-hour rolling window
2. WHEN the Proactivity_Worker detects that a proactive message was already sent to the conversation within the last 24 hours, THE Proactivity_Worker SHALL discard the job without sending
3. THE Proactivity_Worker SHALL record the timestamp of each successfully sent proactive message for rate limit evaluation

### Requirement 8: Dashboard Visibility

**User Story:** As a business admin, I want to see scheduled follow-ups and their delivery status in the dashboard, so that I can monitor proactive outreach activity.

#### Acceptance Criteria

1. THE Dashboard_API SHALL expose an endpoint that returns all conversations with a non-null `next_follow_up_at` for the authenticated tenant
2. THE Dashboard_API SHALL include the conversation customer name, scheduled time, and channel type in the follow-up list response
3. WHEN an admin requests the follow-up list, THE Dashboard_API SHALL return results sorted by `next_follow_up_at` ascending
4. THE Dashboard_API SHALL expose an endpoint to cancel a pending follow-up by setting `next_follow_up_at` to NULL on a specific conversation

### Requirement 9: Tenant Isolation

**User Story:** As a platform operator, I want strict tenant isolation in the proactive outreach system, so that no tenant can access or affect another tenant's data or jobs.

#### Acceptance Criteria

1. THE Proactivity_Worker SHALL validate that the tenant schema exists and belongs to the tenantId in the job payload before executing any database query
2. THE Cron_Scanner SHALL query each tenant schema using parameterized schema names derived from the platform tenants registry
3. THE Proactive_Outreach_Queue SHALL tag each job with the tenantId and the Proactivity_Worker SHALL reject any job where the tenantId does not match the schema ownership
4. FOR ALL proactive outreach operations, THE system SHALL execute database queries exclusively within the tenant schema specified in the job payload
5. THE Tenant_Isolation_Tests SHALL verify that a job enqueued for Tenant A cannot read or modify data belonging to Tenant B
