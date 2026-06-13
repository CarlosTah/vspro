import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { OwnerNotificationService } from './owner-notification.service';
import { NotificationEventsListener } from './notification-events.listener';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'owner-notifications' }),
  ],
  controllers: [NotificationsController],
  providers: [OwnerNotificationService, NotificationEventsListener],
  exports: [OwnerNotificationService],
})
export class NotificationsModule {}
