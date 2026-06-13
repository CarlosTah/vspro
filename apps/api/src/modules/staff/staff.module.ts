import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { AuditLogService } from './audit-log.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'staff-audit' }),
  ],
  controllers: [StaffController],
  providers: [StaffService, AuditLogService],
  exports: [StaffService, AuditLogService],
})
export class StaffModule {}
