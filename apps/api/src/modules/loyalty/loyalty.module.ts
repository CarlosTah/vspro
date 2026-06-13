import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { LoyaltyService } from './loyalty.service';
import { RetentionCronGateway } from './retention-cron.gateway';
import { LoyaltyController } from './loyalty.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: 'loyalty-retention' }),
  ],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, RetentionCronGateway],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
