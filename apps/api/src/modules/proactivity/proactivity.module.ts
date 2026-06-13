import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ProactivityCronService } from './proactivity-cron.service';
import { ProactivityWorker } from './proactivity.worker';
import { ProactivityService } from './proactivity.service';
import { ProactivityController } from './proactivity.controller';
import { AiModule } from '../ai/ai.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({
      name: 'proactive-outreach',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
    forwardRef(() => AiModule),
    MessagingModule,
  ],
  controllers: [ProactivityController],
  providers: [ProactivityCronService, ProactivityWorker, ProactivityService],
  exports: [ProactivityService],
})
export class ProactivityModule {}
