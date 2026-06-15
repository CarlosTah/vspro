import { Module } from '@nestjs/common';
import { UrgencyDetectionService } from './urgency-detection.service';
import { StaffNotificationsModule } from '../staff-notifications/staff-notifications.module';

/** Urgency Detection — NLP alarm for health/vet businesses. */
@Module({ imports: [StaffNotificationsModule], providers: [UrgencyDetectionService], exports: [UrgencyDetectionService] })
export class UrgencyDetectionModule {}
