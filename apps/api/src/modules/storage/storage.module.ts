import { Module, Global } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Global()
@Module({
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
