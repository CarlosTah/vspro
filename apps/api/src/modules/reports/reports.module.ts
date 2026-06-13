import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsSummaryService } from './reports-summary.service';
import { ReportsFinancialService } from './reports-financial.service';
import { ReportsPerformanceService } from './reports-performance.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsSummaryService, ReportsFinancialService, ReportsPerformanceService],
  exports: [ReportsSummaryService, ReportsFinancialService, ReportsPerformanceService],
})
export class ReportsModule {}
