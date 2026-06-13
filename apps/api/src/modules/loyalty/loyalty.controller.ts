import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LoyaltyService } from './loyalty.service';
import { RetentionCronGateway } from './retention-cron.gateway';
import { TenantSchema, CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('loyalty')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly retentionCron: RetentionCronGateway,
  ) {}

  /** Get customer segmentation breakdown */
  @Get('segments')
  @Roles('admin', 'manager')
  getSegments(@TenantSchema() schema: string) {
    return this.loyalty.getLoyaltyStats(schema);
  }

  /** Get full segmentation with customer lists */
  @Get('segmentation')
  @Roles('admin')
  getFullSegmentation(@TenantSchema() schema: string) {
    return this.loyalty.segmentCustomers(schema);
  }

  /** Get re-engagement targets (at-risk + churned) */
  @Get('re-engagement')
  @Roles('admin')
  getReEngagementTargets(@TenantSchema() schema: string) {
    return this.loyalty.getReEngagementTargets(schema);
  }

  /** Manually trigger retention campaign */
  @Post('trigger-retention')
  @Roles('admin')
  async triggerRetention(@CurrentTenant() tenant: any, @TenantSchema() schema: string) {
    // Direct call to process retention for this tenant
    await this.retentionCron.scheduleDailyRetention();
    return { success: true, message: 'Retention campaign triggered' };
  }
}
