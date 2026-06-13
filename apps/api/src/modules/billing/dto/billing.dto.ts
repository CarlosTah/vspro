import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCheckoutDto {
  @ApiProperty({ enum: ['basic', 'pro', 'enterprise'] })
  @IsIn(['basic', 'pro', 'enterprise'])
  planSlug!: string;

  @ApiProperty({ enum: ['monthly', 'yearly'], required: false })
  @IsIn(['monthly', 'yearly'])
  @IsOptional()
  interval?: 'monthly' | 'yearly';
}

export class CreatePortalSessionDto {
  @ApiProperty({ example: 'https://app.vspro.app/settings', required: false })
  @IsString()
  @IsOptional()
  returnUrl?: string;
}
