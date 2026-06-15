import { Module } from '@nestjs/common';
import { MaintenanceTicketsService } from './maintenance-tickets.service';
import { MaintenanceTicketsController } from './maintenance-tickets.controller';
import { MessagingModule } from '../messaging/messaging.module';

/** Maintenance Tickets — Issues with media, dispatched to service providers. */
@Module({ imports: [MessagingModule], controllers: [MaintenanceTicketsController], providers: [MaintenanceTicketsService], exports: [MaintenanceTicketsService] })
export class MaintenanceTicketsModule {}
