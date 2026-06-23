import { Module } from '@nestjs/common';
import { OwnerNotificationService } from './owner-notification.service';
import { NotificationEventsListener } from './notification-events.listener';
import { NotificationsController } from './notifications.controller';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  controllers: [NotificationsController],
  providers: [OwnerNotificationService, NotificationEventsListener],
  exports: [OwnerNotificationService, NotificationEventsListener],
})
export class NotificationsModule {}
