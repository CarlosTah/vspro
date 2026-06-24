import { IsString, IsOptional, IsEmail, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ChannelType } from '@vspro/shared';

export class CreateCustomerDto {
  @ApiProperty({ example: 'María García' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: '5215512345678', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'maria@email.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ enum: ['whatsapp', 'messenger', 'instagram', 'manual', 'web'] })
  @IsIn(['whatsapp', 'messenger', 'instagram', 'manual', 'web'])
  channelType!: string;

  @ApiProperty({ example: '5215512345678' })
  @IsString()
  channelId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  address?: Record<string, any>;

  @ApiProperty({ example: 'Cliente frecuente', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
