import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { VariantsController } from './variants.controller';
import { ProductsService } from './products.service';
import { VariantsService } from './variants.service';

@Module({
  controllers: [ProductsController, VariantsController],
  providers: [ProductsService, VariantsService],
  exports: [ProductsService, VariantsService],
})
export class ProductsModule {}
