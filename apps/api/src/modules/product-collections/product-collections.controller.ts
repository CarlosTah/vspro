import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProductCollectionsService, CreateCollectionDto } from './product-collections.service';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('collections')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('collections')
export class ProductCollectionsController {
  constructor(private readonly collections: ProductCollectionsService) {}

  @Post() @Roles('admin', 'manager')
  create(@Body() dto: CreateCollectionDto, @TenantSchema() schema: string) { return this.collections.create(dto, schema); }

  @Get() @Roles('admin', 'manager', 'operator')
  findAll(@TenantSchema() schema: string) { return this.collections.findAll(schema); }

  @Get(':id') @Roles('admin', 'manager', 'operator')
  findOne(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) { return this.collections.findById(id, schema); }

  @Patch(':id') @Roles('admin', 'manager')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<CreateCollectionDto>, @TenantSchema() schema: string) { return this.collections.update(id, dto, schema); }

  @Delete(':id') @Roles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) { return this.collections.delete(id, schema); }

  @Get('for-product/:productId') @Roles('admin', 'manager', 'operator')
  forProduct(@Param('productId', ParseUUIDPipe) id: string, @TenantSchema() schema: string) { return this.collections.getRecommendationsForProduct(id, schema); }
}
