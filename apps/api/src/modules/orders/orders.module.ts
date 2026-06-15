import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { DashboardController } from './dashboard.controller';
import { OrdersService } from './orders.service';
import { OrderNotificationsService } from './order-notifications.service';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  controllers: [OrdersController, DashboardController],
  providers: [OrdersService, OrderNotificationsService],
  exports: [OrdersService],
})
export class OrdersModule {}
