import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('promotions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  @Roles('admin', 'manager')
  findAll(@TenantSchema() schema: string) {
    return this.promotionsService.findAll(schema);
  }

  @Get('active')
  @Roles('admin', 'manager', 'operator')
  findActive(@TenantSchema() schema: string) {
    return this.promotionsService.findActive(schema);
  }

  @Get(':id')
  @Roles('admin', 'manager')
  findOne(@Param('id') id: string, @TenantSchema() schema: string) {
    return this.promotionsService.findById(id, schema);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreatePromotionDto, @TenantSchema() schema: string) {
    return this.promotionsService.create(dto, schema);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdatePromotionDto, @TenantSchema() schema: string) {
    return this.promotionsService.update(id, dto, schema);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string, @TenantSchema() schema: string) {
    return this.promotionsService.remove(id, schema);
  }
}
