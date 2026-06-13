import { Module } from '@nestjs/common';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { OrdersModule } from '../orders/orders.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [OrdersModule, MessagingModule],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
