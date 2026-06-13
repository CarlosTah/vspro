# Requirements Document

## Introduction

Capa de Proactividad Operativa — Recuperación de Carrito Abandonado. This feature implements an autonomous AI-driven cart recovery system for VSPRO. When an order transitions to `payment_pending` and the customer does not confirm payment within a configurable time window, the system autonomously generates and sends a personalized follow-up message to recover the abandoned cart. The system builds on the existing ProactivityModule (BullMQ queue, ProactivityCronService, ProactivityWorker) and CustomerMemoryService (hybrid JSONB + pgvector memory), extending them with order-aware scheduling, multi-attempt recovery logic, and success tracking.

## Glossary

- **Cart_Recovery_System**: The subsystem responsible for detecting abandoned carts, scheduling recovery jobs, generating personalized messages, and tracking recovery outcomes.
- **Recovery_Job**: A BullMQ job scheduled when an order enters `payment_pending` status, containing tenant, order, customer, and conversation references.
- **Recovery_Attempt**: A single outreach message sent to a customer to recover an abandoned cart. Each order allows a maximum of 2 attempts.
- **Recovery_Scheduler**: The component that listens for order status transitions to `payment_pending` and enqueues delayed recovery jobs.
- **Recovery_Worker**: The BullMQ processor that executes recovery jobs — validates preconditions, generates AI messages, and dispatches them through the appropriate channel.
- **AI_Engine**: The AiEngineService responsible for generating personalized recovery messages using GPT-4o with full customer and order context.
- **Customer_Memory**: The CustomerMemoryService that provides conversation history, customer profile, and episodic memory for AI context injection.
- **Messaging_Window**: The 24-hour window imposed by Meta (WhatsApp/Messenger) during which free-form messages can be sent after the last customer interaction.
- **Recovery_Delay**: The configurable time interval between an order entering `payment_pending` and the first recovery attempt (default: 4 hours).
- **Tenant_Config**: The `ai_config` table row for a tenant, which stores cart recovery settings including enable/disable flag and delay overrides.
- **Order_State_Machine**: The existing order status transition logic in OrdersService that validates transitions between statuses (new → payment_pending → paid → in_production → ready → shipped → delivered | cancelled).
- **ProactivityModule**: The existing module containing ProactivityCronService, ProactivityWorker, and ProactivityService for scheduling and executing proactive outreach.

## Requirements

### Requirement 1: Automatic Recovery Job Scheduling

**User Story:** As a business owner, I want the system to automatically detect when an order enters payment_pending status and schedule a recovery follow-up, so that I don't have to manually track unpaid orders.

#### Acceptance Criteria

1. WHEN an order transitions to `payment_pending` status, THE Recovery_Scheduler SHALL enqueue a Recovery_Job with a delay equal to the tenant's configured Recovery_Delay.
2. THE Recovery_Scheduler SHALL include the order ID, customer ID, conversation ID, tenant ID, schema name, and attempt number in the Recovery_Job payload.
3. WHEN an order transitions to `payment_pending` status and the tenant has cart recovery disabled in Tenant_Config, THE Recovery_Scheduler SHALL not enqueue any Recovery_Job.
4. WHEN a Recovery_Job is enqueued, THE Cart_Recovery_System SHALL store a reference to the job so it can be cancelled if payment is received before the delay expires.

### Requirement 2: Configurable Recovery Delay

**User Story:** As a business owner, I want to configure how long the system waits before sending a recovery message, so that I can adjust the timing to my customers' behavior.

#### Acceptance Criteria

1. THE Tenant_Config SHALL support a `cart_recovery_delay_hours` field with a default value of 4 hours.
2. THE Tenant_Config SHALL support a `cart_recovery_enabled` boolean field with a default value of true.
3. WHEN the Recovery_Scheduler reads the Recovery_Delay, THE Recovery_Scheduler SHALL use the tenant-specific value from Tenant_Config if present, otherwise use the default of 4 hours.
4. THE Tenant_Config SHALL constrain `cart_recovery_delay_hours` to a value between 1 and 72 hours.

### Requirement 3: Pre-Execution Payment Verification

**User Story:** As a business owner, I want the system to verify that payment is still pending before sending a recovery message, so that customers who already paid are not bothered.

#### Acceptance Criteria

1. WHEN a Recovery_Job executes, THE Recovery_Worker SHALL query the current order status before generating any message.
2. IF the order status is no longer `payment_pending` at execution time, THEN THE Recovery_Worker SHALL cancel the job without sending a message and log the cancellation reason.
3. IF the order status is `cancelled` at execution time, THEN THE Recovery_Worker SHALL cancel the job without sending a message.
4. WHEN a Recovery_Job is cancelled due to payment received, THE Cart_Recovery_System SHALL also cancel any subsequent scheduled Recovery_Job for the same order.

### Requirement 4: Multi-Attempt Recovery Strategy

**User Story:** As a business owner, I want the system to send up to two recovery messages at different intervals, so that customers have multiple gentle reminders without being spammed.

#### Acceptance Criteria

1. THE Cart_Recovery_System SHALL support a maximum of 2 Recovery_Attempts per order.
2. WHEN the first Recovery_Attempt is sent and the order remains in `payment_pending` status, THE Cart_Recovery_System SHALL schedule a second Recovery_Job with a delay of 24 hours from the first attempt.
3. WHEN the second Recovery_Attempt is sent, THE Cart_Recovery_System SHALL not schedule any further Recovery_Jobs for that order.
4. THE Recovery_Worker SHALL include the attempt number (1 or 2) in the AI context so the generated message tone can vary between attempts.

### Requirement 5: Personalized AI Message Generation

**User Story:** As a business owner, I want recovery messages to be personalized with the customer's context and order details, so that the message feels natural and relevant rather than generic.

#### Acceptance Criteria

1. WHEN generating a recovery message, THE AI_Engine SHALL receive the customer's conversation history, Customer_Memory profile, and episodic memory context.
2. WHEN generating a recovery message, THE AI_Engine SHALL receive the order details including product names, quantities, and total amount.
3. WHEN generating a recovery message, THE AI_Engine SHALL produce a message in the tenant's configured language and tone.
4. THE AI_Engine SHALL generate a message of no more than 300 characters for the first attempt and no more than 200 characters for the second attempt.
5. WHEN generating a recovery message, THE AI_Engine SHALL reference at least one specific product from the order by name.

### Requirement 6: Channel Delivery with Messaging Window Compliance

**User Story:** As a business owner, I want recovery messages to be delivered through the customer's original channel while respecting platform rules, so that messages are delivered successfully without violating Meta policies.

#### Acceptance Criteria

1. WHEN the Messaging_Window is open (last customer message within 24 hours), THE Recovery_Worker SHALL send the recovery message as a free-form text message through the original channel.
2. WHEN the Messaging_Window has expired, THE Recovery_Worker SHALL send the recovery message using a pre-approved Meta template message.
3. IF the Messaging_Window has expired and no template is configured for the tenant, THEN THE Recovery_Worker SHALL skip the delivery, log a warning, and not count the attempt against the maximum.
4. THE Recovery_Worker SHALL deliver messages through the same channel type (WhatsApp or Messenger) used in the original conversation.

### Requirement 7: Recovery Metrics and Success Tracking

**User Story:** As a business owner, I want to see how effective cart recovery is, so that I can understand the ROI of the feature and adjust my strategy.

#### Acceptance Criteria

1. WHEN a Recovery_Attempt is sent, THE Cart_Recovery_System SHALL record a `recovery_attempted` event with the order ID, attempt number, and timestamp.
2. WHEN an order transitions from `payment_pending` to `paid` within 2 hours of a Recovery_Attempt, THE Cart_Recovery_System SHALL record a `recovery_successful` event linked to that attempt.
3. THE Cart_Recovery_System SHALL maintain a `cart_recovery_attempts` table storing order ID, attempt number, sent timestamp, message content, and outcome status.
4. THE Cart_Recovery_System SHALL calculate and expose recovery rate (successful / attempted) per tenant.

### Requirement 8: Tenant Isolation

**User Story:** As a platform operator, I want each tenant's recovery jobs to be completely isolated, so that one tenant's data or failures cannot affect another tenant.

#### Acceptance Criteria

1. THE Recovery_Worker SHALL validate that the tenant ID in the job payload matches the schema name before executing any query.
2. IF a tenant isolation mismatch is detected, THEN THE Recovery_Worker SHALL reject the job silently and log a security warning.
3. THE Recovery_Worker SHALL execute all database queries within the tenant's isolated schema using parameterized schema references.
4. WHILE a tenant has status `SUSPENDED` or `CANCELLED`, THE Recovery_Worker SHALL skip all Recovery_Jobs for that tenant.

### Requirement 9: Cancellation on Payment Received

**User Story:** As a business owner, I want pending recovery messages to be automatically cancelled when a customer pays, so that they don't receive unnecessary follow-ups after completing payment.

#### Acceptance Criteria

1. WHEN an order transitions from `payment_pending` to `paid`, THE Cart_Recovery_System SHALL cancel all pending Recovery_Jobs for that order.
2. THE Cart_Recovery_System SHALL remove cancelled jobs from the BullMQ queue within 5 seconds of the payment event.
3. WHEN a Recovery_Job is cancelled due to payment, THE Cart_Recovery_System SHALL update the corresponding `cart_recovery_attempts` record with outcome `cancelled_payment_received`.

### Requirement 10: Dashboard Visibility

**User Story:** As a business admin, I want to see pending and completed recovery attempts in the dashboard, so that I can monitor the system's activity and intervene if needed.

#### Acceptance Criteria

1. THE Cart_Recovery_System SHALL expose an API endpoint that returns all pending Recovery_Jobs for the tenant with order details, scheduled time, and attempt number.
2. THE Cart_Recovery_System SHALL expose an API endpoint that returns recovery history with outcome status (sent, successful, cancelled, skipped).
3. THE Cart_Recovery_System SHALL allow an admin to manually cancel a pending Recovery_Job via the dashboard API.
4. THE Cart_Recovery_System SHALL expose aggregate metrics: total attempted, total successful, recovery rate, and average time to recovery.

### Requirement 11: Global Feature Toggle

**User Story:** As a business owner, I want to be able to disable cart recovery entirely for my business, so that I have full control over automated outreach to my customers.

#### Acceptance Criteria

1. WHEN `cart_recovery_enabled` is set to false in Tenant_Config, THE Cart_Recovery_System SHALL not schedule any new Recovery_Jobs for that tenant.
2. WHEN `cart_recovery_enabled` is changed from true to false, THE Cart_Recovery_System SHALL cancel all pending Recovery_Jobs for that tenant.
3. WHEN `cart_recovery_enabled` is changed from false to true, THE Cart_Recovery_System SHALL begin scheduling Recovery_Jobs for new orders entering `payment_pending` status from that point forward.
4. THE Cart_Recovery_System SHALL not retroactively schedule Recovery_Jobs for orders that entered `payment_pending` while the feature was disabled.

### Requirement 12: Rate Limiting and Abuse Prevention

**User Story:** As a platform operator, I want recovery outreach to be rate-limited, so that customers are not overwhelmed and platform messaging quotas are respected.

#### Acceptance Criteria

1. THE Recovery_Worker SHALL send a maximum of 2 recovery messages per order across all attempts.
2. THE Recovery_Worker SHALL enforce a minimum interval of 20 hours between consecutive Recovery_Attempts for the same order.
3. WHILE a customer has received a recovery message within the last 4 hours across any of their orders, THE Recovery_Worker SHALL defer new Recovery_Attempts for that customer.
4. THE Cart_Recovery_System SHALL respect the existing ProactivityService rate limit of 1 proactive message per conversation per 24 hours.
