import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BackupService } from './backup.service';
import { HealthMonitorService } from './health-monitor.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('infrastructure')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('infrastructure')
export class InfrastructureController {
  constructor(
    private readonly backup: BackupService,
    private readonly health: HealthMonitorService,
  ) {}

  /** Detailed health status (postgres, redis, memory, schemas) */
  @Get('health/detailed')
  @Roles('admin')
  getDetailedHealth() {
    return this.health.getDetailedHealth();
  }

  /** Run all health checks on demand */
  @Post('health/check')
  @Roles('admin')
  runHealthCheck() {
    return this.health.checkAll();
  }

  /** Get backup status */
  @Get('backup/status')
  @Roles('admin')
  getBackupStatus() {
    return this.backup.getBackupStatus();
  }

  /** Trigger manual backup */
  @Post('backup/trigger')
  @Roles('admin')
  triggerBackup() {
    return this.backup.triggerManualBackup();
  }
}
