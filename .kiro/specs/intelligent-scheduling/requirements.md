# Requirements Document

## Introduction

Intelligent Scheduling Module for VSPRO: A conversational appointment booking system that enables Mexican PYMEs (beauty salons, clinics, consultants, tutors) to let their customers schedule appointments through WhatsApp, Messenger, and Instagram via AI agents. The module provides 2-way Google Calendar synchronization, staff availability management, automated reminders, cancellation/rescheduling flows, and a REST API for the dashboard. The system integrates as a new AI tool (`schedule_appointment`) available to the Sales and General agents, follows the existing tenant-schema isolation pattern, and leverages BullMQ for background reminder jobs.

## Glossary

- **Scheduling_Module**: The NestJS module responsible for appointment lifecycle management including creation, modification, cancellation, and synchronization with external calendars
- **Appointment**: A database record representing a time-bound booking between a customer and a staff member, stored in the tenant schema with fields for customer_id, staff_id, start_time, end_time, status, and google_event_id
- **CalendarIntegration_Service**: The service responsible for 2-way synchronization between VSPRO appointments and Google Calendar, handling OAuth tokens, event creation, updates, and webhook-driven inbound sync
- **Schedule_Appointment_Tool**: The AI function-calling tool exposed to Sales and General agents enabling customers to book, reschedule, or cancel appointments through conversational channels
- **Staff_Availability**: The configuration defining when each staff member is available for bookings, including weekly recurring schedules, blocked time ranges, and break periods
- **Availability_Slot**: A computed time window where a staff member has no existing appointments and is within their configured availability schedule
- **Reminder_Worker**: The BullMQ job processor responsible for sending appointment reminders to customers through their original messaging channel at configured intervals before the appointment
- **Google_Calendar_Callback**: The webhook endpoint that receives push notifications from Google Calendar when events are created, modified, or deleted externally
- **Tenant_Schema**: The PostgreSQL schema belonging to a specific tenant, containing all business data tables including the new appointments and staff_schedules tables
- **Appointment_Status**: An enumeration of valid appointment states: scheduled, confirmed, cancelled, completed, no_show, late_cancellation
- **Staff_Schedule**: A database record defining a staff member's recurring weekly availability with day-of-week, start time, end time, and optional break periods
- **Booking_Window**: The configurable time boundaries (minimum advance notice and maximum future booking horizon) within which appointments can be scheduled

## Requirements

### Requirement 1: Appointment Data Model

**User Story:** As a platform operator, I want the tenant schema to include tables for appointments and staff schedules, so that each tenant can manage bookings within their isolated database schema.

#### Acceptance Criteria

1. THE Schema_Migration SHALL create an `appointments` table in the tenant schema with columns: id (UUID, primary key), customer_id (UUID, foreign key to customers ON DELETE CASCADE), staff_id (UUID, foreign key to users ON DELETE CASCADE), start_time (TIMESTAMPTZ, NOT NULL), end_time (TIMESTAMPTZ, NOT NULL), status (VARCHAR(50), NOT NULL, default 'scheduled', CHECK constraint limiting values to 'scheduled', 'confirmed', 'cancelled', 'completed', 'no_show'), google_event_id (VARCHAR(255), nullable), service_name (VARCHAR(255), NOT NULL), notes (TEXT, nullable), created_at (TIMESTAMPTZ, NOT NULL, default NOW()), updated_at (TIMESTAMPTZ, NOT NULL, default NOW()), with a CHECK constraint enforcing end_time > start_time
2. THE Schema_Migration SHALL create a `staff_schedules` table in the tenant schema with columns: id (UUID, primary key), staff_id (UUID, foreign key to users ON DELETE CASCADE), day_of_week (INTEGER, NOT NULL, CHECK constraint enforcing value between 0 and 6 inclusive), start_time (TIME, NOT NULL), end_time (TIME, NOT NULL), break_start (TIME, nullable), break_end (TIME, nullable), is_active (BOOLEAN, NOT NULL, default true), with a CHECK constraint enforcing end_time > start_time and a CHECK constraint enforcing that break_start and break_end are either both NULL or both NOT NULL
3. THE Schema_Migration SHALL create an index on appointments(staff_id, start_time, end_time) for efficient conflict detection queries
4. THE Schema_Migration SHALL create an index on appointments(customer_id) for customer appointment history lookups
5. THE Schema_Migration SHALL create a partial index on appointments(status) filtered to rows WHERE status IN ('scheduled', 'confirmed') for active appointment queries
6. THE Schema_Migration SHALL add a UNIQUE constraint on staff_schedules(staff_id, day_of_week) to prevent duplicate schedule entries for the same staff member on the same day

### Requirement 2: Staff Availability Management

**User Story:** As a business admin, I want to configure staff availability schedules, so that customers can only book during times when staff members are actually available.

#### Acceptance Criteria

1. THE Scheduling_Module SHALL expose REST endpoints for creating, updating, and deleting staff schedule entries scoped to the authenticated tenant
2. WHEN a staff schedule entry is created or updated, THE Scheduling_Module SHALL validate that start_time is before end_time and reject the request with an error response indicating the time range is invalid if validation fails
3. WHEN a staff schedule entry includes break times, THE Scheduling_Module SHALL validate that break_start is before break_end and that both break_start and break_end fall within the start_time and end_time range, rejecting the request with an error response indicating the break time constraint violation if validation fails
4. WHEN a request asks for available slots and the staff member has an active schedule for the requested day of the week, THE Scheduling_Module SHALL compute open time windows by subtracting existing confirmed/scheduled appointments and break periods from the staff member's schedule for the requested date
5. IF a request asks for available slots and the staff member has no active schedule for the requested day of the week, THEN THE Scheduling_Module SHALL return an empty list of available slots
6. THE Scheduling_Module SHALL support a configurable slot duration (default 30 minutes, minimum 5 minutes, maximum 480 minutes) per tenant stored in the scheduling_config table
7. WHEN computing available slots, THE Scheduling_Module SHALL exclude slots that start earlier than the configured minimum advance notice (default 2 hours from current time)
8. WHEN computing available slots, THE Scheduling_Module SHALL exclude slots beyond the configured maximum booking horizon (default 30 days from current date)
9. IF a create or update request provides a day_of_week value outside the range 0 to 6, THEN THE Scheduling_Module SHALL reject the request with an error response indicating the day_of_week is invalid

### Requirement 3: AI Tool Integration

**User Story:** As a customer chatting through WhatsApp/Messenger/Instagram, I want to book an appointment through the AI assistant, so that I can schedule services without calling or visiting the business.

#### Acceptance Criteria

1. THE Schedule_Appointment_Tool SHALL be registered as an OpenAI function-calling tool available to the Sales and General agents with parameters: action (enum: check_availability, book, reschedule, cancel), staff_id (optional UUID), date (optional string in YYYY-MM-DD format), time_preference (optional string: morning, afternoon, evening), service_name (optional string), appointment_id (optional UUID for reschedule/cancel)
2. WHEN the action is "check_availability" and both staff_id and date are provided, THE Schedule_Appointment_Tool SHALL return a maximum of 5 available slots for the specified staff member and date, formatted as time options (e.g., "10:00 AM", "10:30 AM") in the tenant's configured timezone
3. WHEN the action is "book" and the requested slot is within the tenant's configured booking window (minimum advance notice and maximum horizon) and does not conflict with existing scheduled or confirmed appointments, THE Schedule_Appointment_Tool SHALL create an Appointment record with status 'scheduled' and return a confirmation message including staff name, date, time, and service_name
4. WHEN the action is "book" and the requested slot conflicts with an existing scheduled or confirmed appointment for the same staff member, THE Schedule_Appointment_Tool SHALL return an error message indicating the conflict along with up to 3 alternative available slots on the same date
5. WHEN the action is "reschedule" and a valid appointment_id is provided, THE Schedule_Appointment_Tool SHALL validate that the new slot is available, update the existing appointment's start_time and end_time, set status to 'rescheduled', then immediately set status to 'scheduled' for the new slot in a single operation
6. WHEN the action is "cancel" and a valid appointment_id is provided, THE Schedule_Appointment_Tool SHALL set the appointment status to 'cancelled' so that the time slot becomes available for conflict detection queries
7. IF the customer has no existing appointments with status 'scheduled' or 'confirmed' and requests cancellation or rescheduling, THEN THE Schedule_Appointment_Tool SHALL return a message indicating no active appointments were found for the customer
8. THE Schedule_Appointment_Tool SHALL retrieve the customer_id from the AgentContext and associate all bookings with the current conversation's customer
9. IF the customer_id is null in the AgentContext, THEN THE Schedule_Appointment_Tool SHALL return an error message indicating the customer could not be identified and the booking cannot proceed
10. IF the action is "reschedule" or "cancel" and the provided appointment_id does not correspond to an existing appointment belonging to the current customer, THEN THE Schedule_Appointment_Tool SHALL return an error message indicating the appointment was not found
11. IF the action is "check_availability" and staff_id or date is not provided, THEN THE Schedule_Appointment_Tool SHALL return an error message indicating which required parameters are missing for availability lookup

### Requirement 4: Google Calendar Two-Way Synchronization

**User Story:** As a business owner, I want appointments to sync with Google Calendar automatically, so that my staff can see their bookings in their familiar calendar app and external changes reflect in VSPRO.

#### Acceptance Criteria

1. WHEN an appointment is created in VSPRO for a staff member with a linked Google Calendar, THE CalendarIntegration_Service SHALL enqueue an outbound sync job that creates a corresponding Google Calendar event with the appointment's start_time, end_time, service_name, and customer name as event title, and store the returned google_event_id on the appointment record within 30 seconds of job processing
2. WHEN an appointment's start_time, end_time, status, or service_name is modified in VSPRO, THE CalendarIntegration_Service SHALL enqueue an outbound sync job that updates the corresponding Google Calendar event using the stored google_event_id
3. WHEN an appointment is cancelled in VSPRO, THE CalendarIntegration_Service SHALL enqueue an outbound sync job that deletes the corresponding Google Calendar event using the stored google_event_id
4. WHEN the Google_Calendar_Callback receives a push notification for an event change on an event with a matching google_event_id, THE CalendarIntegration_Service SHALL update the corresponding appointment's start_time and end_time in the tenant schema to reflect the external modification
5. WHEN the Google_Calendar_Callback receives a push notification for a new event created externally that has no matching appointment, THE CalendarIntegration_Service SHALL create a blocked time slot in the appointments table with status 'confirmed', extracting start_time and end_time from the event, to prevent double-booking
6. IF an inbound sync from Google Calendar would create or modify an appointment that overlaps an existing scheduled or confirmed appointment for the same staff member, THEN THE CalendarIntegration_Service SHALL log a conflict warning and skip the conflicting change without modifying existing appointments
7. THE CalendarIntegration_Service SHALL store Google OAuth2 refresh tokens encrypted in the tenant schema associated with the staff member's user record
8. IF the Google Calendar API returns an authentication error after 1 retry attempt, THEN THE CalendarIntegration_Service SHALL mark the staff member's calendar connection as disconnected, discard pending sync jobs for that staff member, and log a warning
9. IF an appointment is created or updated for a staff member who has no linked Google Calendar connection, THEN THE CalendarIntegration_Service SHALL skip calendar synchronization without raising an error
10. THE CalendarIntegration_Service SHALL use a BullMQ queue for outbound calendar sync operations with a maximum of 3 retry attempts using exponential backoff starting at 5 seconds, to handle rate limiting without blocking the main request flow

### Requirement 5: Google Calendar Webhook Handling

**User Story:** As a platform operator, I want a secure webhook endpoint for Google Calendar push notifications, so that external calendar changes are captured reliably.

#### Acceptance Criteria

1. THE Google_Calendar_Callback SHALL be exposed at the path `/webhooks/google-calendar` and excluded from tenant middleware authentication
2. WHEN a webhook notification is received with an X-Goog-Channel-ID header, THE Google_Calendar_Callback SHALL validate the header value against registered channel subscriptions to identify the tenant and staff member
3. WHEN a valid notification is received from a recognized channel subscription, THE Google_Calendar_Callback SHALL enqueue a sync job in the calendar sync BullMQ queue containing the tenantId, schemaName, staffId, and Google resource ID, and respond with HTTP 200 within 5 seconds
4. IF the webhook receives a notification with an unrecognized channel ID, THEN THE Google_Calendar_Callback SHALL respond with HTTP 200 and log a warning without processing
5. IF the webhook receives a notification without an X-Goog-Channel-ID header, THEN THE Google_Calendar_Callback SHALL respond with HTTP 200 and discard the request without enqueuing a sync job
6. THE CalendarIntegration_Service SHALL register watch subscriptions on each connected staff member's calendar and renew them at least 24 hours before the subscription expiration time
7. IF a watch subscription renewal fails after 3 retry attempts, THEN THE CalendarIntegration_Service SHALL mark the staff member's calendar subscription as expired and log an error

### Requirement 6: Appointment Reminders

**User Story:** As a business owner, I want customers to receive automatic reminders before their appointments, so that no-shows are reduced and customers arrive prepared.

#### Acceptance Criteria

1. WHEN an appointment is created with status 'scheduled' or 'confirmed', THE Scheduling_Module SHALL enqueue reminder jobs in the Reminder_Worker queue only for configured intervals that are still in the future relative to the current time (default intervals: 24 hours and 1 hour before appointment start_time as defined in scheduling_config.reminder_intervals_hours)
2. WHEN the Reminder_Worker processes a reminder job, THE Reminder_Worker SHALL send a reminder message to the customer through the conversation's original messaging channel
3. THE Reminder_Worker SHALL include the appointment date, time, staff name, and service in the reminder message
4. IF the appointment status has changed to 'cancelled' or 'rescheduled' between enqueueing and processing, THEN THE Reminder_Worker SHALL discard the reminder job without sending a message
5. WHEN an appointment is rescheduled, THE Scheduling_Module SHALL cancel existing reminder jobs for the old time and enqueue new reminder jobs for the updated time
6. WHILE the elapsed time since last inbound message from the customer exceeds 24 hours, THE Reminder_Worker SHALL use an approved Meta message template for the reminder instead of a free-form message
7. IF the messaging channel returns a delivery failure when the Reminder_Worker attempts to send a reminder, THEN THE Reminder_Worker SHALL retry delivery up to 3 times with exponential backoff and, if all retries fail, mark the reminder job as failed and log the failure without further attempts

### Requirement 7: Cancellation and Rescheduling

**User Story:** As a customer, I want to cancel or reschedule my appointment through the chat, so that I can manage my bookings conveniently without calling.

#### Acceptance Criteria

1. WHEN a customer requests cancellation through the AI agent, THE Schedule_Appointment_Tool SHALL confirm the cancellation intent with the customer, set the appointment status to 'cancelled', and delete the corresponding Google Calendar event
2. WHEN a customer requests rescheduling through the AI agent, THE Schedule_Appointment_Tool SHALL validate that the new requested slot is available and, if available, update the appointment's start_time and end_time to the new slot and set the status to 'scheduled'
3. IF a rescheduling request conflicts with existing appointments, THEN THE Schedule_Appointment_Tool SHALL present up to 3 alternative available slots to the customer
4. IF a cancellation or rescheduling request is made for an appointment with start_time less than the configured cancellation_window_hours (default: 2 hours) from the current time, THEN THE Scheduling_Module SHALL allow the cancellation but set the appointment status to 'late_cancellation' instead of 'cancelled'
5. WHEN an appointment is cancelled or late-cancelled, THE Scheduling_Module SHALL free the time slot within the same operation so it becomes available for other bookings
6. IF a customer requests cancellation or rescheduling of an appointment whose status is already 'cancelled', 'completed', or 'no_show', THEN THE Schedule_Appointment_Tool SHALL return a message indicating the appointment cannot be modified due to its current status
7. WHEN an appointment is rescheduled, THE Scheduling_Module SHALL cancel existing reminder jobs for the original time and enqueue new reminder jobs for the updated time

### Requirement 8: REST API for Dashboard

**User Story:** As a business admin, I want a REST API to view and manage appointments from the dashboard, so that staff can oversee the daily schedule and make adjustments.

#### Acceptance Criteria

1. THE Scheduling_Module SHALL expose GET /appointments with pagination (default page size 20, maximum page size 100), filtering by status, staff_id, date range (ISO 8601 date format), and customer_id, scoped to the authenticated tenant
2. THE Scheduling_Module SHALL expose GET /appointments/:id returning appointment details including id, customer_id, customer name, staff_id, staff name, start_time, end_time, status, service_name, google_event_id, notes, created_at, and updated_at
3. THE Scheduling_Module SHALL expose POST /appointments for manual appointment creation from the dashboard with required fields: customer_id, staff_id, start_time, end_time, service_name, and SHALL apply overlap conflict detection before creating the record
4. THE Scheduling_Module SHALL expose PATCH /appointments/:id for updating appointment status (allowing transitions: scheduled→confirmed, scheduled→cancelled, confirmed→cancelled, confirmed→completed, scheduled→no_show, confirmed→no_show), time, or staff assignment
5. THE Scheduling_Module SHALL expose DELETE /appointments/:id for cancelling an appointment (sets status to 'cancelled')
6. THE Scheduling_Module SHALL expose GET /staff/:id/availability?date=YYYY-MM-DD returning available time slots as an array of objects with start_time and end_time in the tenant's configured timezone for a specific staff member on a given date
7. WHEN a dashboard user creates or modifies an appointment, THE Scheduling_Module SHALL trigger Google Calendar synchronization for the affected staff member
8. IF a POST /appointments request is missing required fields or contains invalid data (start_time not before end_time, referenced customer_id or staff_id not found), THEN THE Scheduling_Module SHALL reject the request with a validation error response indicating the failing fields
9. IF a GET, PATCH, or DELETE request references an appointment :id that does not exist within the tenant schema, THEN THE Scheduling_Module SHALL return a not-found error response
10. IF a PATCH /appointments/:id request attempts an invalid status transition, THEN THE Scheduling_Module SHALL reject the request with an error response indicating the allowed transitions from the current status

### Requirement 9: Tenant Isolation

**User Story:** As a platform operator, I want strict tenant isolation in the scheduling module, so that no tenant can access or affect another tenant's appointments, staff schedules, or calendar connections.

#### Acceptance Criteria

1. THE Scheduling_Module SHALL execute all database queries exclusively within the tenant schema identified by the authenticated request's tenant record (resolved via subdomain or x-tenant-slug header)
2. WHEN the Reminder_Worker receives a job, THE Reminder_Worker SHALL validate that the tenant schema exists and that the schemaName in the job payload matches the schemaName stored for that tenantId in the central tenants table before executing any database query
3. IF the Reminder_Worker detects a mismatch between the job payload's schemaName and the tenant record's schemaName, THEN THE Reminder_Worker SHALL discard the job without executing any query and log a tenant isolation violation including the tenantId and mismatched schemaName
4. THE CalendarIntegration_Service SHALL store and retrieve OAuth tokens only from the tenant schema whose schemaName matches the tenantId resolved from the job payload
5. IF the CalendarIntegration_Service cannot resolve a valid tenant schema for the job's tenantId, THEN THE CalendarIntegration_Service SHALL reject the operation without reading or writing any token data and log a tenant isolation violation
6. THE Schedule_Appointment_Tool SHALL use the schemaName from the AgentContext to scope all database queries for scheduling operations initiated by the AI agent
7. WHEN the Google_Calendar_Callback receives a webhook event, THE Google_Calendar_Callback SHALL resolve the tenant from the registered channel subscription and process webhook data exclusively within that tenant's schema; IF the tenant cannot be resolved from the channel subscription, THEN THE Google_Calendar_Callback SHALL discard the webhook payload without writing to any schema

### Requirement 10: Conflict Prevention

**User Story:** As a business owner, I want the system to prevent double-booking, so that no two customers are scheduled with the same staff member at overlapping times.

#### Acceptance Criteria

1. WHEN a new appointment is requested, THE Scheduling_Module SHALL check for overlapping appointments (where existing start_time < new end_time AND existing end_time > new start_time) for the same staff_id with status 'scheduled' or 'confirmed'
2. IF an overlap is detected, THEN THE Scheduling_Module SHALL reject the booking and return up to 5 available alternative slots for the same staff member on the same day, or the next day with availability if no same-day slots remain
3. THE Scheduling_Module SHALL acquire a database-level advisory lock per staff_id during appointment creation with a timeout of 5 seconds to prevent race conditions in concurrent booking attempts
4. IF the advisory lock cannot be acquired within the 5-second timeout, THEN THE Scheduling_Module SHALL reject the booking request and return an error message indicating a temporary scheduling conflict, prompting the customer to retry
5. WHEN the Google_Calendar_Callback creates a blocked time slot from an external event, THE Scheduling_Module SHALL apply the same overlap detection logic to prevent conflicts with externally-created events
6. IF an externally-created Google Calendar event conflicts with an existing VSPRO appointment with status 'scheduled' or 'confirmed', THEN THE Scheduling_Module SHALL mark the conflicting VSPRO appointment status as 'cancelled', free the time slot, and enqueue a notification to the affected customer indicating the appointment was cancelled due to a scheduling conflict

### Requirement 11: Scheduling Configuration

**User Story:** As a business admin, I want to configure scheduling parameters for my business, so that booking rules match my operational needs.

#### Acceptance Criteria

1. THE Schema_Migration SHALL create a `scheduling_config` table in the tenant schema with columns: id (UUID), slot_duration_minutes (INTEGER, default 30), min_advance_notice_hours (INTEGER, default 2), max_booking_horizon_days (INTEGER, default 30), cancellation_window_hours (INTEGER, default 2), reminder_intervals_hours (JSONB, default '[24, 1]'), timezone (VARCHAR(50), default 'America/Mexico_City'), updated_at (TIMESTAMPTZ), with a UNIQUE constraint on the table ensuring at most one configuration record per tenant schema
2. THE Scheduling_Module SHALL expose a GET endpoint for reading and a PATCH endpoint for updating the scheduling configuration scoped to the authenticated tenant, where updatable fields are: slot_duration_minutes, min_advance_notice_hours, max_booking_horizon_days, cancellation_window_hours, reminder_intervals_hours, and timezone
3. WHEN any scheduling operation references time, THE Scheduling_Module SHALL interpret and store times in UTC and display times converted to the tenant's configured timezone
4. WHEN a new tenant is provisioned, THE Scheduling_Module SHALL seed a default scheduling_config record with all columns set to their defined default values
5. IF a scheduling configuration update request contains invalid values, THEN THE Scheduling_Module SHALL reject the request with an error message indicating the validation failure, where valid ranges are: slot_duration_minutes between 5 and 480, min_advance_notice_hours between 0 and 168, max_booking_horizon_days between 1 and 365, cancellation_window_hours between 0 and 168, and reminder_intervals_hours as an array of 1 to 10 integer entries each between 1 and 720
6. IF a scheduling configuration update provides a timezone value that is not a valid IANA timezone identifier, THEN THE Scheduling_Module SHALL reject the request with an error message indicating the timezone is unrecognized
