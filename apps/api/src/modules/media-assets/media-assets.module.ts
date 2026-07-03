import { Module } from '@nestjs/common';
import { MediaAssetsController } from './media-assets.controller';

@Module({
  controllers: [MediaAssetsController],
})
export class MediaAssetsModule {}
