import { Module } from '@nestjs/common';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { OrdersModule } from '../orders/orders.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [OrdersModule, MessagingModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
