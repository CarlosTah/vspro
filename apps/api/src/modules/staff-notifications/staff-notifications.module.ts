import { Module } from '@nestjs/common';
import { StaffNotificationsService } from './staff-notifications.service';
import { StaffNotificationsController } from './staff-notifications.controller';
import { MessagingModule } from '../messaging/messaging.module';

/**
 * Staff Notifications Module — WhatsApp notifications to internal team.
 *
 * Problem: Staff (mechanic, cook, operator) needs to receive real-time
 * alerts by WhatsApp when something happens in the system.
 *
 * Notifications:
 * - New order assigned to them
 * - Payment verified on their order
 * - Customer authorized work (mechanic scenario)
 * - Low stock alert
 * - Appointment reminder for their schedule
 * - Delivery assigned to them
 * - Customer complaint/escalation
 *
 * Configuration: Each staff member opts-in to notification types.
 * Uses existing MessagingFactory to send WhatsApp directly.
 */
@Module({
  imports: [MessagingModule],
  controllers: [StaffNotificationsController],
  providers: [StaffNotificationsService],
  exports: [StaffNotificationsService],
})
export class StaffNotificationsModule {}
