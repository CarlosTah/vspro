import { Module } from '@nestjs/common';
import { InvoicingController } from './invoicing.controller';
import { InvoicingService } from './invoicing.service';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [OrdersModule],
  controllers: [InvoicingController],
  providers: [InvoicingService],
  exports: [InvoicingService],
})
export class InvoicingModule {}
