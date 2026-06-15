import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ServiceRemindersService } from './service-reminders.service';
import { ServiceRemindersController } from './service-reminders.controller';
import { MessagingModule } from '../messaging/messaging.module';

/**
 * Service Reminders Module — Recurring reminders based on time/km/intervals.
 * Used by: talleres (cambio aceite cada 6 meses), clínicas (vacunas anuales),
 * veterinarias (desparasitación cada 3 meses).
 */
@Module({
  imports: [ScheduleModule.forRoot(), MessagingModule],
  controllers: [ServiceRemindersController],
  providers: [ServiceRemindersService],
  exports: [ServiceRemindersService],
})
export class ServiceRemindersModule {}
