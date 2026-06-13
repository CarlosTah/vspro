import { IsUUID, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignToProductionDto {
  @ApiProperty({ example: 'uuid-del-usuario-de-produccion', required: false })
  @IsUUID()
  @IsOptional()
  assignedTo?: string;

  @ApiProperty({ example: 'Preparar con empaque especial', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
