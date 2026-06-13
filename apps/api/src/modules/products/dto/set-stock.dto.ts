import { IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetStockDto {
  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  stockAvailable!: number;

  @ApiProperty({ example: 5, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  stockMinimum?: number;
}
