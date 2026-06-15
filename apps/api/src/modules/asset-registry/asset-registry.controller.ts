import { Controller, Get, Post, Patch, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AssetRegistryService, CreateAssetDto } from './asset-registry.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('assets')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('assets')
export class AssetRegistryController {
  constructor(private readonly assets: AssetRegistryService) {}

  @Post()
  @Roles('admin', 'manager', 'operator')
  create(@Body() dto: CreateAssetDto, @TenantSchema() schema: string) { return this.assets.create(dto, schema); }

  @Get('customer/:customerId')
  @Roles('admin', 'manager', 'operator')
  getByCustomer(@Param('customerId', ParseUUIDPipe) id: string, @TenantSchema() schema: string) { return this.assets.getByCustomer(id, schema); }

  @Get(':id')
  @Roles('admin', 'manager', 'operator')
  findOne(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) { return this.assets.findById(id, schema); }

  @Patch(':id')
  @Roles('admin', 'manager', 'operator')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: { details: Record<string, any> }, @TenantSchema() schema: string) { return this.assets.update(id, body.details, schema); }

  @Get(':id/history')
  @Roles('admin', 'manager', 'operator')
  history(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) { return this.assets.getServiceHistory(id, schema); }
}
