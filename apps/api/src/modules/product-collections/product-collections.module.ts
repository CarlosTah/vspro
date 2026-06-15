import { Module } from '@nestjs/common';
import { ProductCollectionsService } from './product-collections.service';
import { ProductCollectionsController } from './product-collections.controller';

@Module({ controllers: [ProductCollectionsController], providers: [ProductCollectionsService], exports: [ProductCollectionsService] })
export class ProductCollectionsModule {}
