import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'TORT-001' })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiProperty({ example: 'Tortilla de maíz 1kg' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 'Tortilla artesanal de maíz azul', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 25.00 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiProperty({ example: 'Tortillas', required: false })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ example: ['https://s3.../img.jpg'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
