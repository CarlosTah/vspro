import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@tortilleria.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'tortilleria-don-jose', description: 'Slug del negocio' })
  @IsString()
  @MinLength(3)
  tenantSlug!: string;
}
