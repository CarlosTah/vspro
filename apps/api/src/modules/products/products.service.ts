import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SetStockDto } from './dto/set-stock.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Productos ────────────────────────────────────────────────

  async findAll(schemaName: string, onlyActive = true) {
    const where = onlyActive ? 'WHERE p.is_active = true' : '';
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        p.id, p.sku, p.name, p.description, p.price,
        p.category, p.images, p.is_active AS "isActive",
        p.created_at AS "createdAt",
        i.stock_available AS "stockAvailable",
        i.stock_reserved  AS "stockReserved",
        i.stock_minimum   AS "stockMinimum"
      FROM "${schemaName}".products p
      LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
      ${where}
      ORDER BY p.name ASC
    `);
    return rows;
  }

  async findById(id: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        p.id, p.sku, p.name, p.description, p.price,
        p.category, p.images, p.is_active AS "isActive",
        p.created_at AS "createdAt",
        i.stock_available AS "stockAvailable",
        i.stock_reserved  AS "stockReserved",
        i.stock_minimum   AS "stockMinimum"
      FROM "${schemaName}".products p
      LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
      WHERE p.id = $1::uuid
    `, id);

    if (!rows[0]) throw new NotFoundException(`Producto ${id} no encontrado`);
    return rows[0];
  }

  async create(dto: CreateProductDto, schemaName: string) {
    // Verificar SKU único si se proporcionó
    if (dto.sku) {
      const existing = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM "${schemaName}".products WHERE sku = $1`,
        dto.sku,
      );
      if (existing.length > 0) {
        throw new ConflictException(`El SKU '${dto.sku}' ya existe`);
      }
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".products
        (sku, name, description, price, category, images, is_active)
      VALUES ($1, $2, $3, $4, $5, $6::text[], $7)
      RETURNING id, sku, name, description, price, category,
                images, is_active AS "isActive", created_at AS "createdAt"
    `,
      dto.sku ?? null,
      dto.name,
      dto.description ?? null,
      dto.price,
      dto.category ?? null,
      dto.images ?? [],
      dto.isActive ?? true,
    );

    const product = rows[0];

    // Crear registro de inventario con stock 0
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".inventory (product_id, stock_available, stock_minimum)
      VALUES ($1::uuid, 0, 5)
    `, product.id);

    return { ...product, stockAvailable: 0, stockReserved: 0, stockMinimum: 5 };
  }

  async update(id: string, dto: UpdateProductDto, schemaName: string) {
    await this.findById(id, schemaName); // lanza 404 si no existe

    // Construir SET dinámico solo con los campos enviados
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.sku !== undefined)         { fields.push(`sku = $${idx++}`);         values.push(dto.sku); }
    if (dto.name !== undefined)        { fields.push(`name = $${idx++}`);        values.push(dto.name); }
    if (dto.description !== undefined) { fields.push(`description = $${idx++}`); values.push(dto.description); }
    if (dto.price !== undefined)       { fields.push(`price = $${idx++}`);       values.push(dto.price); }
    if (dto.category !== undefined)    { fields.push(`category = $${idx++}`);    values.push(dto.category); }
    if (dto.isActive !== undefined)    { fields.push(`is_active = $${idx++}`);   values.push(dto.isActive); }
    if (dto.images !== undefined) {
      fields.push(`images = $${idx++}`);
      values.push(`{${dto.images.map((u) => `"${u}"`).join(',')}}`);
    }

    if (fields.length === 0) return this.findById(id, schemaName);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".products SET ${fields.join(', ')} WHERE id = $${idx}::uuid`,
      ...values,
    );

    return this.findById(id, schemaName);
  }

  async remove(id: string, schemaName: string) {
    await this.findById(id, schemaName);
    // Soft delete — marcar como inactivo en lugar de eliminar
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".products SET is_active = false, updated_at = NOW() WHERE id = $1::uuid`,
      id,
    );
    return { success: true };
  }

  // ─── Inventario ───────────────────────────────────────────────

  async setStock(id: string, dto: SetStockDto, schemaName: string) {
    await this.findById(id, schemaName);

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".inventory
      SET stock_available = $1,
          stock_minimum   = COALESCE($2, stock_minimum),
          updated_at      = NOW()
      WHERE product_id = $3::uuid
    `, dto.stockAvailable, dto.stockMinimum ?? null, id);

    return this.findById(id, schemaName);
  }

  async getLowStockProducts(schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        p.id, p.name, p.sku,
        i.stock_available AS "stockAvailable",
        i.stock_minimum   AS "stockMinimum"
      FROM "${schemaName}".products p
      JOIN "${schemaName}".inventory i ON i.product_id = p.id
      WHERE p.is_active = true
        AND i.stock_available <= i.stock_minimum
      ORDER BY i.stock_available ASC
    `);
  }

  // ─── Búsqueda ─────────────────────────────────────────────────

  async search(query: string, schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        p.id, p.sku, p.name, p.description, p.price, p.category,
        p.images, p.is_active AS "isActive",
        i.stock_available AS "stockAvailable"
      FROM "${schemaName}".products p
      LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
      WHERE p.is_active = true
        AND (
          p.name ILIKE $1
          OR p.description ILIKE $1
          OR p.sku ILIKE $1
          OR p.category ILIKE $1
        )
      ORDER BY p.name ASC
      LIMIT 20
    `, `%${query}%`);
  }
}
