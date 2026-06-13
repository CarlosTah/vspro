import { Controller, Get, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RentalService } from './rental.service';
import { CheckAvailabilityDto, CreateReservationDto } from './dto/check-availability.dto';
import { TenantSchema } from '../../common/decorators/tenant.decorator';

@ApiTags('rental')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('rental')
export class RentalController {
  constructor(private readonly rentalService: RentalService) {}

  /** Verificar disponibilidad de una propiedad */
  @Post('check-availability')
  checkAvailability(@Body() dto: CheckAvailabilityDto, @TenantSchema() schema: string) {
    return this.rentalService.checkAvailability(dto, schema);
  }

  /** Crear reservación */
  @Post('reservations')
  createReservation(@Body() dto: CreateReservationDto, @TenantSchema() schema: string) {
    return this.rentalService.createReservation(dto, schema);
  }

  /** Calendario de disponibilidad (próximos 60 días) */
  @Get('calendar/:productId')
  getCalendar(
    @Param('productId', ParseUUIDPipe) productId: string,
    @TenantSchema() schema: string,
  ) {
    return this.rentalService.getCalendar(productId, schema);
  }
}
