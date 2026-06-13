import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VariantsService } from './variants.service';
import { CreateVariantDto, UpdateVariantDto } from './dto/variant.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';

@ApiTags('product-variants')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('products')
export class VariantsController {
  constructor(private readonly variantsService: VariantsService) {}

  /** Listar variantes de un producto */
  @Get(':productId/variants')
  findByProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @TenantSchema() schema: string,
  ) {
    return this.variantsService.findByProduct(productId, schema);
  }

  /** Crear variante */
  @Post('variants')
  create(@Body() dto: CreateVariantDto, @TenantSchema() schema: string) {
    return this.variantsService.create(dto, schema);
  }

  /** Actualizar variante */
  @Patch('variants/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVariantDto,
    @TenantSchema() schema: string,
  ) {
    return this.variantsService.update(id, dto, schema);
  }

  /** Eliminar variante */
  @Delete('variants/:id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.variantsService.remove(id, schema);
  }
}
