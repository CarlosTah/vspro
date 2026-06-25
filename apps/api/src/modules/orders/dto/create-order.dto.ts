import {
  IsUUID, IsArray, IsString, IsNumber,
  IsOptional, IsIn, ValidateNested, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ChannelType } from '@vspro/shared';

export class OrderItemDto {
  @ApiProperty({ example: 'uuid-del-producto' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CreateOrderDto {
  @ApiProperty({ example: 'uuid-del-cliente' })
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ enum: ['whatsapp', 'messenger', 'instagram', 'manual', 'web'] })
  @IsIn(['whatsapp', 'messenger', 'instagram', 'manual', 'web'])
  channelType!: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiProperty({ example: 'Sin cebolla por favor', required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ enum: ['pickup', 'delivery'], required: false, description: 'Tipo de entrega: recoger en local o envío a domicilio' })
  @IsIn(['pickup', 'delivery'])
  @IsOptional()
  deliveryType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  shippingAddress?: Record<string, any>;

  @ApiProperty({ required: false, description: 'Initial status for manual orders (e.g. payment_verified)' })
  @IsString()
  @IsOptional()
  status?: string;
}
