import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsSummaryService } from './reports-summary.service';
import { ReportsFinancialService } from './reports-financial.service';
import { ReportsPerformanceService } from './reports-performance.service';
import { ReportScheduleCronService } from './report-schedule-cron.service';
import { ReportScheduleController } from './report-schedule.controller';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  controllers: [ReportsController, ReportScheduleController],
  providers: [ReportsSummaryService, ReportsFinancialService, ReportsPerformanceService, ReportScheduleCronService],
  exports: [ReportsSummaryService, ReportsFinancialService, ReportsPerformanceService],
})
export class ReportsModule {}
