import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, UseInterceptors, ParseUUIDPipe,
  UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SetStockDto } from './dto/set-stock.dto';
import { CurrentTenant, TenantSchema } from '../../common/decorators/tenant.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { PlanFeatureGuard } from '../../common/guards/plan-feature.guard';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('products')
export class ProductsController {
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly endpoint: string;

  constructor(
    private readonly productsService: ProductsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const accessKey = this.config.get('AWS_ACCESS_KEY_ID');
    const secretKey = this.config.get('AWS_SECRET_ACCESS_KEY');
    const region = this.config.get('AWS_REGION', 'nyc3');
    this.bucket = this.config.get('AWS_S3_BUCKET', 'vspro-uploads');
    this.endpoint = this.config.get('AWS_S3_ENDPOINT', `https://${region}.digitaloceanspaces.com`);

    this.s3 = accessKey && secretKey ? new S3Client({
      region,
      endpoint: this.endpoint,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: false,
    }) : null;
  }

  @Get()
  @ApiQuery({ name: 'all', required: false, type: Boolean })
  findAll(
    @TenantSchema() schema: string,
    @Query('all') all?: string,
  ) {
    return this.productsService.findAll(schema, all !== 'true');
  }

  @Get('low-stock')
  @RequireFeature('advancedReports')
  @UseGuards(PlanFeatureGuard)
  getLowStock(@TenantSchema() schema: string) {
    return this.productsService.getLowStockProducts(schema);
  }

  @Get('search')
  @ApiQuery({ name: 'q', required: true })
  search(@TenantSchema() schema: string, @Query('q') q: string) {
    return this.productsService.search(q, schema);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.productsService.findById(id, schema);
  }

  @Post()
  create(@Body() dto: CreateProductDto, @TenantSchema() schema: string) {
    return this.productsService.create(dto, schema);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @TenantSchema() schema: string,
  ) {
    return this.productsService.update(id, dto, schema);
  }

  @Patch(':id/stock')
  setStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStockDto,
    @TenantSchema() schema: string,
  ) {
    return this.productsService.setStock(id, dto, schema);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantSchema() schema: string,
  ) {
    return this.productsService.remove(id, schema);
  }

  /** Upload image for a product (saves to DO Spaces, adds URL to images array) */
  @Post(':id/upload-image')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
    @TenantSchema() schema: string,
  ) {
    if (!file) throw new Error('No se proporcionó imagen');
    if (!this.s3) throw new Error('Storage no configurado');

    // Generate unique filename
    const ext = file.originalname.split('.').pop() ?? 'jpg';
    const key = `products/${schema}/${id}/${Date.now()}.${ext}`;

    // Upload to DO Spaces
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read',
    }));

    const imageUrl = `${this.endpoint}/${this.bucket}/${key}`;

    // Add to product images array
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".products
      SET images = array_append(COALESCE(images, '{}'), $1), updated_at = NOW()
      WHERE id = $2::uuid
    `, imageUrl, id);

    return { success: true, url: imageUrl };
  }

  /** Remove an image from a product */
  @Delete(':id/images')
  async removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { url: string },
    @TenantSchema() schema: string,
  ) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".products
      SET images = array_remove(images, $1), updated_at = NOW()
      WHERE id = $2::uuid
    `, body.url, id);

    return { success: true };
  }
}
