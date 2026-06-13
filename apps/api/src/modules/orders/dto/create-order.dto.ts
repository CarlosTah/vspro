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
  customerId!: string;

  @ApiProperty({ enum: ['whatsapp', 'messenger', 'instagram'] })
  @IsIn(['whatsapp', 'messenger', 'instagram'])
  channelType!: ChannelType;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @ApiProperty({ example: 'Sin cebolla por favor', required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  shippingAddress?: Record<string, any>;
}
