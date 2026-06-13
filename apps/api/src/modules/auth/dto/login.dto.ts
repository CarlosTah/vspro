import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@tortilleria.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'MiPassword123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    example: 'tortilleria-don-jose',
    description: 'Slug del tenant. Opcional si se usa subdominio.',
    required: false,
  })
  @IsString()
  @IsOptional()
  tenantSlug?: string;
}
