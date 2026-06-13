import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BackupEngineService } from './backup-engine.service';
import { BackupCronRegistry } from './backup-cron.registry';
import { S3StorageGateway } from './s3-storage.gateway';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('backups')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('backups')
export class BackupEngineController {
  constructor(
    private readonly backupEngine: BackupEngineService,
    private readonly cronRegistry: BackupCronRegistry,
    private readonly s3: S3StorageGateway,
  ) {}

  /** Get S3 configuration status */
  @Get('status')
  getStatus() {
    return this.s3.getStatus();
  }

  /** Get backup history (last 7 days) */
  @Get('history')
  getHistory() {
    return this.backupEngine.getBackupHistory(7);
  }

  /** Trigger manual backup */
  @Post('trigger')
  triggerBackup(@Req() req: any) {
    return this.cronRegistry.triggerManualBackup(req.user?.sub ?? 'admin');
  }

  /** Trigger cleanup of old backups */
  @Post('cleanup')
  triggerCleanup() {
    return this.backupEngine.cleanupOldBackups();
  }
}
