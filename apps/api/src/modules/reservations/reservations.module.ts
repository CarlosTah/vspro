import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { PropertiesRentalController } from './properties.controller';

@Module({
  controllers: [ReservationsController, PropertiesRentalController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
