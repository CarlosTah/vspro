import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface CreateCollectionDto {
  name: string;
  description?: string;
  productIds: string[];
  discountPercent?: number;
  imageUrl?: string;
}

/**
 * Product Collections — Lookbooks, bundles, outfit combos.
 * Used by: ropa (outfits), restaurantes (combos), beauty (paquetes).
 * When customer buys one item from the collection, suggest the rest with discount.
 */
@Injectable()
export class ProductCollectionsService {
  private readonly logger = new Logger(ProductCollectionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCollectionDto, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".product_collections (name, description, product_ids, discount_percent, image_url)
      VALUES ($1, $2, $3::jsonb, $4, $5)
      RETURNING id, name, description, discount_percent AS "discountPercent", created_at AS "createdAt"
    `, dto.name, dto.description ?? null, JSON.stringify(dto.productIds), dto.discountPercent ?? 0, dto.imageUrl ?? null);
    return rows[0];
  }

  async findAll(schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, description, product_ids AS "productIds", discount_percent AS "discountPercent", image_url AS "imageUrl", is_active AS "isActive"
      FROM "${schemaName}".product_collections WHERE is_active = true ORDER BY created_at DESC
    `);
  }

  async findById(id: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT c.*, (SELECT json_agg(json_build_object('id',p.id,'name',p.name,'price',p.price,'images',p.images))
        FROM "${schemaName}".products p WHERE p.id::text = ANY(SELECT jsonb_array_elements_text(c.product_ids))) AS products
      FROM "${schemaName}".product_collections c WHERE c.id = $1::uuid
    `, id);
    if (!rows[0]) throw new NotFoundException('Collection not found');
    return rows[0];
  }

  async getRecommendationsForProduct(productId: string, schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT c.id, c.name, c.discount_percent AS "discountPercent", c.product_ids AS "productIds"
      FROM "${schemaName}".product_collections c
      WHERE c.is_active = true AND c.product_ids @> $1::jsonb
    `, JSON.stringify([productId]));
  }

  async update(id: string, dto: Partial<CreateCollectionDto>, schemaName: string) {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (dto.name) { sets.push(`name = $${idx++}`); params.push(dto.name); }
    if (dto.description) { sets.push(`description = $${idx++}`); params.push(dto.description); }
    if (dto.productIds) { sets.push(`product_ids = $${idx++}::jsonb`); params.push(JSON.stringify(dto.productIds)); }
    if (dto.discountPercent !== undefined) { sets.push(`discount_percent = $${idx++}`); params.push(dto.discountPercent); }
    if (sets.length === 0) return this.findById(id, schemaName);
    params.push(id);
    await this.prisma.$executeRawUnsafe(`UPDATE "${schemaName}".product_collections SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx}::uuid`, ...params);
    return this.findById(id, schemaName);
  }

  async delete(id: string, schemaName: string) {
    await this.prisma.$executeRawUnsafe(`UPDATE "${schemaName}".product_collections SET is_active = false WHERE id = $1::uuid`, id);
  }
}
