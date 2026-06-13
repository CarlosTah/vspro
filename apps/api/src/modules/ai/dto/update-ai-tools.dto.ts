import { IsString, IsArray, IsOptional, ValidateNested, IsObject, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ToolParameterDto {
  @ApiProperty({ example: 'productName' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'string', enum: ['string', 'number', 'boolean', 'array'] })
  @IsString()
  type!: string;

  @ApiProperty({ example: 'Nombre del producto a buscar' })
  @IsString()
  description!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  required?: boolean;
}

export class CustomToolDto {
  @ApiProperty({ example: 'check_room_availability' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'Verifica disponibilidad de una habitación para las fechas indicadas' })
  @IsString()
  description!: string;

  @ApiProperty({ type: [ToolParameterDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolParameterDto)
  parameters!: ToolParameterDto[];

  @ApiProperty({ example: 'rental', description: 'Módulo que ejecuta esta herramienta' })
  @IsString()
  handler!: string;

  @ApiProperty({ example: 'checkAvailability', description: 'Método del servicio a llamar' })
  @IsString()
  method!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

export class UpdateAiToolsDto {
  @ApiProperty({ type: [CustomToolDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomToolDto)
  tools!: CustomToolDto[];
}
