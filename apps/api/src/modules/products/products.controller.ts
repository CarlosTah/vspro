import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, UseInterceptors, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SetStockDto } from './dto/set-stock.dto';
import { CurrentTenant, TenantSchema } from '../../common/decorators/tenant.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { PlanFeatureGuard } from '../../common/guards/plan-feature.guard';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiQuery({ name: 'all', required: false, type: Boolean })
  findAll(
    @TenantSchema() schema: string,
    @Query('all') all?: string,
  ) {
    return this.productsService.findAll(schema, all !== 'true');
  }

  @Get('low-stock')
  @RequireFeature('advancedReports')
  @UseGuards(PlanFeatureGuard)
  getLowStock(@TenantSchema() schema: string) {
    return this.productsService.getLowStockProducts(schema);
  }

  @Get('search')
  @ApiQuery({ name: 'q', required: true })
  search(@TenantSchema() schema: string, @Query('q') q: string) {
    return this.productsService.search(q, schema);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.productsService.findById(id, schema);
  }

  @Post()
  create(@Body() dto: CreateProductDto, @TenantSchema() schema: string) {
    return this.productsService.create(dto, schema);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @TenantSchema() schema: string,
  ) {
    return this.productsService.update(id, dto, schema);
  }

  @Patch(':id/stock')
  setStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStockDto,
    @TenantSchema() schema: string,
  ) {
    return this.productsService.setStock(id, dto, schema);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.productsService.remove(id, schema);
  }
}
