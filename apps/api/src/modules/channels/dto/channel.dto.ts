import { IsString, IsIn, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChannelDto {
  @ApiProperty({ enum: ['whatsapp', 'messenger', 'instagram'] })
  @IsIn(['whatsapp', 'messenger', 'instagram'])
  type!: string;

  @ApiProperty({ example: '123456789012345', description: 'Phone Number ID (WhatsApp) o Page ID (Messenger/Instagram)' })
  @IsString()
  externalId!: string;

  @ApiProperty({ example: 'EAABx...', description: 'Access token de Meta' })
  @IsString()
  accessToken!: string;

  @ApiProperty({ example: 'mi-token-secreto', required: false })
  @IsString()
  @IsOptional()
  webhookVerifyToken?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  config?: Record<string, any>;
}

export class UpdateChannelDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  externalId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  accessToken?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  config?: Record<string, any>;
}
