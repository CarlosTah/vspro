import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { DashboardController } from './dashboard.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController, DashboardController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
