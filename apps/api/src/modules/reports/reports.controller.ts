import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsSummaryService } from './reports-summary.service';
import { ReportsFinancialService } from './reports-financial.service';
import { ReportsPerformanceService } from './reports-performance.service';
import { ReportPeriodDto } from './dto/reports.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly summary: ReportsSummaryService,
    private readonly financial: ReportsFinancialService,
    private readonly performance: ReportsPerformanceService,
  ) {}

  /** Business summary: orders, revenue, customers, conversations */
  @Get('summary')
  @Roles('admin', 'manager')
  getSummary(@Query() query: ReportPeriodDto, @TenantSchema() schema: string) {
    const { from, to } = this.resolvePeriod(query);
    return this.summary.getBusinessSummary(schema, from, to);
  }

  /** Financial dashboard: income, payments, accounting, trends */
  @Get('financial')
  @Roles('admin')
  getFinancial(@Query() query: ReportPeriodDto, @TenantSchema() schema: string) {
    const { from, to } = this.resolvePeriod(query);
    return this.financial.getFinancialDashboard(schema, from, to);
  }

  /** Performance metrics: fulfillment, AI, products, channels */
  @Get('performance')
  @Roles('admin', 'manager')
  getPerformance(@Query() query: ReportPeriodDto, @TenantSchema() schema: string) {
    const { from, to } = this.resolvePeriod(query);
    return this.performance.getPerformanceMetrics(schema, from, to);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private resolvePeriod(query: ReportPeriodDto): { from: string; to: string } {
    if (query.from && query.to) {
      return { from: query.from, to: query.to };
    }

    const now = new Date();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      .toISOString().split('T')[0];

    switch (query.period) {
      case 'today': {
        const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          .toISOString().split('T')[0];
        return { from, to };
      }
      case 'week': {
        const from = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
        return { from, to };
      }
      case 'quarter': {
        const from = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0];
        return { from, to };
      }
      case 'year': {
        const from = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        return { from, to };
      }
      case 'month':
      default: {
        const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        return { from, to };
      }
    }
  }
}
