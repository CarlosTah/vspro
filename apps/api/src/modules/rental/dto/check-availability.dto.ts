import { IsString, IsDateString, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckAvailabilityDto {
  @ApiProperty({ example: 'uuid-del-producto (habitación/propiedad)' })
  @IsString()
  productId!: string;

  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  checkIn!: string;

  @ApiProperty({ example: '2026-06-18' })
  @IsDateString()
  checkOut!: string;

  @ApiProperty({ example: 2, required: false })
  @IsNumber()
  @Min(1)
  @IsOptional()
  guests?: number;
}

export class CreateReservationDto {
  @ApiProperty({ example: 'uuid-del-producto' })
  @IsString()
  productId!: string;

  @ApiProperty({ example: 'uuid-del-cliente' })
  @IsString()
  customerId!: string;

  @ApiProperty({ example: '2026-06-15' })
  @IsDateString()
  checkIn!: string;

  @ApiProperty({ example: '2026-06-18' })
  @IsDateString()
  checkOut!: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  guests!: number;

  @ApiProperty({ example: 'Llegamos tarde, después de las 10pm', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
