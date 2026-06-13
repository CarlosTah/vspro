import { IsEmail, IsString, IsIn, IsOptional, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InviteUserDto {
  @ApiProperty({ example: 'pedro@tortilleria.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Pedro García' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ enum: ['admin', 'manager', 'operator'] })
  @IsIn(['admin', 'manager', 'operator'])
  role!: string;

  @ApiProperty({ example: 'TempPass123!', required: false })
  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: ['admin', 'manager', 'operator'] })
  @IsIn(['admin', 'manager', 'operator'])
  role!: string;
}
