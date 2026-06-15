import { Module } from '@nestjs/common';
import { AssetRegistryService } from './asset-registry.service';
import { AssetRegistryController } from './asset-registry.controller';

@Module({
  controllers: [AssetRegistryController],
  providers: [AssetRegistryService],
  exports: [AssetRegistryService],
})
export class AssetRegistryModule {}
