import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateVariantDto, UpdateVariantDto } from './dto/variant.dto';

@Injectable()
export class VariantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByProduct(productId: string, schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, product_id AS "productId", sku, name, price,
        stock_available AS "stockAvailable",
        stock_reserved AS "stockReserved",
        attributes, is_active AS "isActive",
        created_at AS "createdAt"
      FROM "${schemaName}".product_variants
      WHERE product_id = $1::uuid
      ORDER BY name ASC
    `, productId);
  }

  async findById(id: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        v.id, v.product_id AS "productId", v.sku, v.name, v.price,
        v.stock_available AS "stockAvailable",
        v.stock_reserved AS "stockReserved",
        v.attributes, v.is_active AS "isActive",
        v.created_at AS "createdAt",
        p.name AS "productName", p.price AS "productPrice"
      FROM "${schemaName}".product_variants v
      JOIN "${schemaName}".products p ON p.id = v.product_id
      WHERE v.id = $1::uuid
    `, id);

    if (!rows[0]) throw new NotFoundException(`Variante ${id} no encontrada`);
    return rows[0];
  }

  async create(dto: CreateVariantDto, schemaName: string) {
    // Verificar que el producto existe
    const products = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "${schemaName}".products WHERE id = $1::uuid`,
      dto.productId,
    );
    if (!products[0]) throw new NotFoundException('Producto no encontrado');

    // Verificar SKU único si se proporcionó
    if (dto.sku) {
      const existing = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM "${schemaName}".product_variants WHERE sku = $1`,
        dto.sku,
      );
      if (existing.length > 0) {
        throw new ConflictException(`El SKU '${dto.sku}' ya existe`);
      }
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".product_variants
        (product_id, sku, name, price, stock_available, attributes)
      VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
      RETURNING id, product_id AS "productId", sku, name, price,
                stock_available AS "stockAvailable",
                attributes, is_active AS "isActive",
                created_at AS "createdAt"
    `,
      dto.productId,
      dto.sku ?? null,
      dto.name,
      dto.price ?? null,
      dto.stockAvailable,
      JSON.stringify(dto.attributes ?? {}),
    );

    return rows[0];
  }

  async update(id: string, dto: UpdateVariantDto, schemaName: string) {
    await this.findById(id, schemaName);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.name !== undefined) { fields.push(`name = $${idx++}`); values.push(dto.name); }
    if (dto.price !== undefined) { fields.push(`price = $${idx++}`); values.push(dto.price); }
    if (dto.stockAvailable !== undefined) { fields.push(`stock_available = $${idx++}`); values.push(dto.stockAvailable); }
    if (dto.attributes !== undefined) { fields.push(`attributes = $${idx++}::jsonb`); values.push(JSON.stringify(dto.attributes)); }
    if (dto.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(dto.isActive); }

    if (fields.length === 0) return this.findById(id, schemaName);

    values.push(id);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".product_variants SET ${fields.join(', ')} WHERE id = $${idx}::uuid`,
      ...values,
    );

    return this.findById(id, schemaName);
  }

  async remove(id: string, schemaName: string) {
    await this.findById(id, schemaName);
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "${schemaName}".product_variants WHERE id = $1::uuid`,
      id,
    );
    return { success: true };
  }
}
