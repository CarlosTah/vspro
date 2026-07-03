import { IsString, IsOptional, IsEnum, IsObject, IsNumber, IsArray, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PromotionType {
  COMBO = 'combo',
  DISCOUNT = 'discount',
  BOGO = 'bogo',
  BUNDLE = 'bundle',
}

export enum PromotionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SCHEDULED = 'scheduled',
}

export class CreatePromotionDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: PromotionType }) @IsEnum(PromotionType) type!: PromotionType;
  @ApiProperty() @IsObject() rules!: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxUses?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() daysActive?: string[];
}

export class UpdatePromotionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(PromotionType) type?: PromotionType;
  @ApiPropertyOptional() @IsOptional() @IsEnum(PromotionStatus) status?: PromotionStatus;
  @ApiPropertyOptional() @IsOptional() @IsObject() rules?: Record<string, any>;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxUses?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() daysActive?: string[];
}
