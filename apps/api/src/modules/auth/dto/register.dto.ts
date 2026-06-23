import { IsEmail, IsString, MinLength, MaxLength, Matches, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'tortilleria-don-jose' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'El slug solo puede contener letras minúsculas, números y guiones',
  })
  slug!: string;

  @ApiProperty({ example: 'Tortillería Don José' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  businessName!: string;

  @ApiProperty({ example: 'jose@tortilleria.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'José Hernández' })
  @IsString()
  @MinLength(2)
  ownerName!: string;

  @ApiProperty({ example: 'MiPassword123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'restaurante', enum: ['restaurante', 'barberia', 'ropa', 'taller', 'clinica', 'inmobiliaria', 'ecommerce'] })
  @IsString()
  @IsIn(['restaurante', 'barberia', 'ropa', 'taller', 'clinica', 'inmobiliaria', 'ecommerce'])
  industry!: string;

  @ApiProperty({ example: 'basic', enum: ['basic', 'pro', 'enterprise'], required: false })
  @IsOptional()
  @IsString()
  @IsIn(['basic', 'pro', 'enterprise'])
  plan?: string;
}
