import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryIntegrationService } from './sentry-integration.service';
import { BackupService } from './backup.service';
import { HealthMonitorService } from './health-monitor.service';
import { InfrastructureController } from './infrastructure.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [InfrastructureController],
  providers: [SentryIntegrationService, BackupService, HealthMonitorService],
  exports: [SentryIntegrationService, BackupService, HealthMonitorService],
})
export class InfrastructureModule {}
