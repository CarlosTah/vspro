import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { BackupEngineService } from './backup-engine.service';
import { S3StorageGateway } from './s3-storage.gateway';
import { BackupCronRegistry } from './backup-cron.registry';
import { BackupEngineController } from './backup-engine.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: 'infrastructure-backups' }),
  ],
  controllers: [BackupEngineController],
  providers: [BackupEngineService, S3StorageGateway, BackupCronRegistry],
  exports: [BackupEngineService, S3StorageGateway],
})
export class BackupEngineModule {}
