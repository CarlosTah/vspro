import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsReportsService } from './analytics-reports.service';
import { AnalyticsCronGateway } from './analytics-cron.gateway';
import { TenantSchema, CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly reports: AnalyticsReportsService,
    private readonly cronGateway: AnalyticsCronGateway,
  ) {}

  /** Get daily report for a specific date */
  @Get('daily')
  @Roles('admin', 'manager')
  getDailyReport(@Query('date') date: string, @TenantSchema() schema: string) {
    return this.reports.generateDailyReport(schema, date);
  }

  /** Get today's report */
  @Get('today')
  @Roles('admin', 'manager')
  getTodayReport(@TenantSchema() schema: string) {
    return this.reports.generateDailyReport(schema);
  }

  /** Get conversion funnel for a date range */
  @Get('conversion')
  @Roles('admin', 'manager')
  getConversionRate(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('period') period: string,
    @TenantSchema() schema: string,
  ) {
    return this.reports.getConversionAnalytics(schema, from, to, period);
  }

  /** Manually trigger report generation + push */
  @Post('trigger')
  @Roles('admin')
  async triggerReport(@CurrentTenant() tenant: any, @TenantSchema() schema: string) {
    await this.cronGateway.triggerForTenant(tenant.id, schema, tenant.slug);
    return { success: true, message: 'Report generation triggered' };
  }
}
