import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LoyaltyService } from './loyalty.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('loyalty')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('config')
  @Roles('admin', 'manager')
  getConfig(@TenantSchema() schema: string) {
    return this.loyaltyService.getConfig(schema);
  }

  @Patch('config')
  @Roles('admin')
  updateConfig(@Body() body: any, @TenantSchema() schema: string) {
    return this.loyaltyService.updateConfig(schema, body);
  }

  @Get('leaderboard')
  @Roles('admin', 'manager')
  getLeaderboard(@TenantSchema() schema: string) {
    return this.loyaltyService.getTopCustomers(schema);
  }

  @Get('customer/:customerId')
  @Roles('admin', 'manager', 'operator')
  getCustomerLoyalty(@Param('customerId') customerId: string, @TenantSchema() schema: string) {
    return this.loyaltyService.getCustomerLoyalty(customerId, schema);
  }
}
