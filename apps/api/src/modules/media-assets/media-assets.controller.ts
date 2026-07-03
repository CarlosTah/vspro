import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@ApiTags('media-assets')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('media-assets')
export class MediaAssetsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async ensureTable(schema: string) {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schema}".media_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(50) NOT NULL DEFAULT 'general',
        title VARCHAR(255),
        url TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  @Get()
  @Roles('admin', 'manager')
  async list(@TenantSchema() schema: string, @Query('type') type?: string) {
    await this.ensureTable(schema);
    const filter = type ? `WHERE type = '${type}' AND is_active = true` : 'WHERE is_active = true';
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, type, title, url, is_active AS "isActive", sort_order AS "sortOrder", created_at AS "createdAt"
      FROM "${schema}".media_assets ${filter}
      ORDER BY sort_order ASC, created_at DESC
    `);
  }

  @Post('upload')
  @Roles('admin', 'manager')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: any,
    @Body() body: { type?: string; title?: string },
    @TenantSchema() schema: string,
  ) {
    if (!file) throw new Error('No se proporcionó archivo');
    await this.ensureTable(schema);

    // Upload to DigitalOcean Spaces
    const url = await this.uploadToSpaces(file, schema);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schema}".media_assets (type, title, url)
      VALUES ($1, $2, $3)
      RETURNING id, type, title, url, created_at AS "createdAt"
    `, body.type ?? 'general', body.title ?? file.originalname, url);

    return rows[0];
  }

  @Post()
  @Roles('admin', 'manager')
  async createFromUrl(@Body() body: { type: string; title: string; url: string }, @TenantSchema() schema: string) {
    await this.ensureTable(schema);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schema}".media_assets (type, title, url)
      VALUES ($1, $2, $3)
      RETURNING id, type, title, url, created_at AS "createdAt"
    `, body.type ?? 'general', body.title, body.url);
    return rows[0];
  }

  @Delete(':id')
  @Roles('admin')
  async delete(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    await this.prisma.$executeRawUnsafe(`DELETE FROM "${schema}".media_assets WHERE id = $1::uuid`, id);
    return { success: true };
  }

  private async uploadToSpaces(file: any, schema: string): Promise<string> {
    try {
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const spacesEndpoint = this.config.get('DO_SPACES_ENDPOINT', 'https://nyc3.digitaloceanspaces.com');
      const spacesBucket = this.config.get('DO_SPACES_BUCKET', 'vspro-storage');
      const spacesKey = this.config.get('DO_SPACES_KEY', '');
      const spacesSecret = this.config.get('DO_SPACES_SECRET', '');

      if (!spacesKey || !spacesSecret) {
        // Fallback: save as base64 data URL if no Spaces configured
        const base64 = file.buffer.toString('base64');
        return `data:${file.mimetype};base64,${base64}`;
      }

      const s3 = new S3Client({
        endpoint: spacesEndpoint,
        region: 'nyc3',
        credentials: { accessKeyId: spacesKey, secretAccessKey: spacesSecret },
      });

      const key = `media/${schema}/${crypto.randomUUID()}-${file.originalname}`;
      await s3.send(new PutObjectCommand({
        Bucket: spacesBucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      }));

      const cdnUrl = spacesEndpoint.replace('https://', `https://${spacesBucket}.`).replace('.digitaloceanspaces.com', '.cdn.digitaloceanspaces.com');
      return `${cdnUrl}/${key}`;
    } catch {
      // If upload fails, store as base64
      const base64 = file.buffer.toString('base64');
      return `data:${file.mimetype};base64,${base64}`;
    }
  }
}
