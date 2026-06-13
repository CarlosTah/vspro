import {
  IsString, IsEmail, IsNumber, IsOptional,
  MinLength, MaxLength, Matches, Min, IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class OnboardingBusinessDto {
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

  @ApiProperty({ example: '5215512345678', required: false })
  @IsString()
  @IsOptional()
  phone?: string;
}

export class OnboardingProductDto {
  @ApiProperty({ example: 'Tortilla de maíz 1kg' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 25.00 })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty({ example: 'Tortillas', required: false })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ example: 100, required: false })
  @IsNumber()
  @IsOptional()
  initialStock?: number;
}

export class OnboardingCompleteDto {
  @ApiProperty({ type: OnboardingBusinessDto })
  @ValidateNested()
  @Type(() => OnboardingBusinessDto)
  business!: OnboardingBusinessDto;

  @ApiProperty({ type: [OnboardingProductDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingProductDto)
  @IsOptional()
  products?: OnboardingProductDto[];
}
