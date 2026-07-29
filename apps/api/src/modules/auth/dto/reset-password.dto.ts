import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token de recuperación recibido por email' })
  @IsString()
  token!: string;

  @ApiProperty({
    example: 'NuevaPassword123!',
    description: 'Nueva contraseña (mínimo 8 caracteres)',
  })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
