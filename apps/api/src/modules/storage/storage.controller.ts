import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

class GetUploadUrlDto {
  @ApiProperty({ example: 'comprobante.jpg' })
  @IsString()
  filename!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  contentType!: string;

  @ApiProperty({ enum: ['products', 'payments', 'logos', 'documents'] })
  @IsIn(['products', 'payments', 'logos', 'documents'])
  folder!: 'products' | 'payments' | 'logos' | 'documents';
}

@ApiTags('storage')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * Obtiene una presigned URL para subir un archivo directamente a S3.
   * El frontend usa esta URL para hacer PUT del archivo sin pasar por el servidor.
   */
  @Post('upload-url')
  getUploadUrl(@Body() dto: GetUploadUrlDto, @Body() _req: any) {
    // TODO: extraer tenantSlug del request
    const tenantSlug = 'default';
    return this.storageService.getPresignedUploadUrl(
      tenantSlug,
      dto.folder,
      dto.filename,
      dto.contentType,
    );
  }
}
