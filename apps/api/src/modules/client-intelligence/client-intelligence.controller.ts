import { Controller, Get, Post, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PreferenceVectorsService } from './preference-vectors.service';
import { PurchaseHistoryService } from './purchase-history.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('client-intelligence')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('intelligence/customers')
export class ClientIntelligenceController {
  constructor(
    private readonly preferences: PreferenceVectorsService,
    private readonly history: PurchaseHistoryService,
  ) {}

  @Get(':id/insights')
  @Roles('admin', 'manager')
  getInsights(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.preferences.getPreferenceInsights(id, schema);
  }

  @Get(':id/recommendations')
  @Roles('admin', 'manager')
  getRecommendations(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.preferences.recommendProducts(id, schema);
  }

  @Get(':id/purchase-analysis')
  @Roles('admin', 'manager')
  getPurchaseAnalysis(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    return this.history.getAnalysis(id, schema);
  }

  @Post(':id/build-vector')
  @Roles('admin')
  async buildVector(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    await this.preferences.buildPreferenceVector(id, schema);
    return { success: true, message: 'Preference vector built' };
  }
}
