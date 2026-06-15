import { Module } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';
import { MessagingModule } from '../messaging/messaging.module';
import { OrdersModule } from '../orders/orders.module';

/**
 * Returns & Exchanges Module.
 *
 * Handles: refunds, size exchanges, product returns.
 * Flow:
 * 1. Customer requests return/exchange via chat
 * 2. AI agent checks eligibility (time window, product condition)
 * 3. If exchange: checks stock of desired size/variant
 * 4. Generates return authorization (tracking label placeholder)
 * 5. Notifies owner/staff
 * 6. On receipt: processes refund or ships replacement
 */
@Module({
  imports: [MessagingModule, OrdersModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
