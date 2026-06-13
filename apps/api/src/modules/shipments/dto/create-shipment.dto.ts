import { IsString, IsNumber, IsOptional, IsIn, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateShipmentDto {
  @ApiProperty({ example: 'uuid-del-pedido' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ enum: ['fedex', 'dhl', 'estafeta', '99minutos', 'skydropx', 'otro'] })
  @IsIn(['fedex', 'dhl', 'estafeta', '99minutos', 'skydropx', 'otro'])
  carrier!: string;

  @ApiProperty({ example: 'FDX-123456789' })
  @IsString()
  trackingNumber!: string;

  @ApiProperty({ example: 'https://fedex.com/track?id=123', required: false })
  @IsString()
  @IsOptional()
  trackingUrl?: string;

  @ApiProperty({ example: 85.50, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  cost?: number;

  @ApiProperty({ example: '2026-05-10', required: false })
  @IsString()
  @IsOptional()
  estimatedDelivery?: string;
}
