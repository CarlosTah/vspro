import { IsString, IsNumber, IsOptional, IsBoolean, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVariantDto {
  @ApiProperty({ example: 'uuid-del-producto' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 'TORT-001-1KG' })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiProperty({ example: 'Presentación 1kg' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 25.00, required: false, description: 'null = usa precio del producto padre' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  stockAvailable!: number;

  @ApiProperty({ example: { talla: 'M', color: 'Rojo' } })
  @IsOptional()
  attributes?: Record<string, any>;
}

export class UpdateVariantDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  stockAvailable?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  attributes?: Record<string, any>;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
