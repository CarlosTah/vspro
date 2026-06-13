import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsReportsService } from './analytics-reports.service';
import { AnalyticsCronGateway } from './analytics-cron.gateway';
import { AnalyticsNotificationDispatcher } from './analytics-notification.dispatcher';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: 'analytics-cron' }),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsReportsService, AnalyticsCronGateway, AnalyticsNotificationDispatcher],
  exports: [AnalyticsReportsService],
})
export class AnalyticsModule {}
