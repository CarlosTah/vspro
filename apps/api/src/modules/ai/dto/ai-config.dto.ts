import { IsString, IsOptional, IsIn, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAiConfigDto {
  @ApiProperty({ example: 'Lupita' })
  @IsString()
  @IsOptional()
  assistantName?: string;

  @ApiProperty({ enum: ['formal', 'casual', 'friendly'] })
  @IsIn(['formal', 'casual', 'friendly'])
  @IsOptional()
  tone?: string;

  @ApiProperty({ example: '¡Hola! Soy Lupita, ¿en qué te ayudo?' })
  @IsString()
  @IsOptional()
  welcomeMessage?: string;

  @ApiProperty({ example: 'Estamos fuera de horario, te responderemos pronto.' })
  @IsString()
  @IsOptional()
  awayMessage?: string;

  @ApiProperty({ example: 'es' })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiProperty({ example: 'Siempre ofrece envío gratis en pedidos mayores a $500' })
  @IsString()
  @IsOptional()
  customInstructions?: string;

  @ApiProperty({ example: { mon: { open: '09:00', close: '18:00' } } })
  @IsOptional()
  businessHours?: Record<string, any>;

  @ApiProperty({ example: true })
  @IsBoolean()
  @IsOptional()
  humanHandoffEnabled?: boolean;

  @ApiProperty({ description: 'Business data (name, phone, address, social media, location)', required: false })
  @IsOptional()
  businessData?: Record<string, any>;
}

export class TestChatDto {
  @ApiProperty({ example: 'Hola, quiero pedir 2 tortillas de maíz' })
  @IsString()
  message!: string;
}
