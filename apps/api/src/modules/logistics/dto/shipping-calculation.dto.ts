import { IsString, IsNumber, IsOptional, IsObject, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateShippingCalculationDto {
  @ApiProperty({ example: 'uuid-del-pedido', required: false })
  @IsString()
  @IsOptional()
  orderId?: string;

  @ApiProperty({ example: { street: 'Av. Tulum 123', city: 'Cancún', state: 'QR', zipCode: '77500' } })
  @IsObject()
  originAddress!: Record<string, any>;

  @ApiProperty({ example: { street: 'Calle 10 #45', city: 'Mérida', state: 'YUC', zipCode: '97000' } })
  @IsObject()
  destinationAddress!: Record<string, any>;

  @ApiProperty({ example: 2.5, description: 'Peso en kg' })
  @IsNumber()
  @Min(0.1)
  weightKg!: number;

  @ApiProperty({ example: { length: 30, width: 20, height: 15 }, required: false })
  @IsObject()
  @IsOptional()
  dimensions?: { length: number; width: number; height: number };

  @ApiProperty({ example: 'standard', enum: ['standard', 'express', 'same_day'] })
  @IsString()
  @IsOptional()
  serviceType?: string;
}
