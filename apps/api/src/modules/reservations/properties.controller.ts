import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantSchema } from '../../common/decorators/tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../database/prisma.service';

export interface CreatePropertyDto {
  name: string;
  description?: string;
  address?: string;
  lat?: number;
  lng?: number;
  capacity?: number;
  bedrooms?: number;
  bathrooms?: number;
  amenities?: string[];
  rules?: string[];
  images?: string[];
  pricePerNight?: number;
  pricePerWeek?: number;
  pricePerMonth?: number;
  minNights?: number;
}

@ApiTags('properties')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('properties-rental')
export class PropertiesRentalController {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureTable(schema: string) {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schema}".properties (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        address VARCHAR(500),
        lat DECIMAL(10,7),
        lng DECIMAL(10,7),
        capacity INTEGER NOT NULL DEFAULT 2,
        bedrooms INTEGER NOT NULL DEFAULT 1,
        bathrooms INTEGER NOT NULL DEFAULT 1,
        amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
        rules JSONB NOT NULL DEFAULT '[]'::jsonb,
        images JSONB NOT NULL DEFAULT '[]'::jsonb,
        price_per_night DECIMAL(10,2) NOT NULL DEFAULT 0,
        price_per_week DECIMAL(10,2),
        price_per_month DECIMAL(10,2),
        min_nights INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  @Get()
  @Roles('admin', 'manager')
  async list(@TenantSchema() schema: string) {
    await this.ensureTable(schema);
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, description, address, lat, lng, capacity, bedrooms, bathrooms,
             amenities, rules, images, price_per_night AS "pricePerNight",
             price_per_week AS "pricePerWeek", price_per_month AS "pricePerMonth",
             min_nights AS "minNights", is_active AS "isActive", created_at AS "createdAt"
      FROM "${schema}".properties
      ORDER BY created_at ASC
    `);
  }

  @Get(':id')
  @Roles('admin', 'manager')
  async getOne(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    await this.ensureTable(schema);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, description, address, lat, lng, capacity, bedrooms, bathrooms,
             amenities, rules, images, price_per_night AS "pricePerNight",
             price_per_week AS "pricePerWeek", price_per_month AS "pricePerMonth",
             min_nights AS "minNights", is_active AS "isActive"
      FROM "${schema}".properties WHERE id = $1::uuid
    `, id);
    return rows[0] ?? null;
  }

  @Post()
  @Roles('admin')
  async create(@Body() dto: CreatePropertyDto, @TenantSchema() schema: string) {
    await this.ensureTable(schema);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schema}".properties
        (name, description, address, lat, lng, capacity, bedrooms, bathrooms,
         amenities, rules, images, price_per_night, price_per_week, price_per_month, min_nights)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, $15)
      RETURNING id, name, capacity, price_per_night AS "pricePerNight"
    `, dto.name, dto.description ?? '', dto.address ?? '', dto.lat ?? null, dto.lng ?? null,
       dto.capacity ?? 2, dto.bedrooms ?? 1, dto.bathrooms ?? 1,
       JSON.stringify(dto.amenities ?? []), JSON.stringify(dto.rules ?? []),
       JSON.stringify(dto.images ?? []),
       dto.pricePerNight ?? 0, dto.pricePerWeek ?? null, dto.pricePerMonth ?? null, dto.minNights ?? 1);
    return rows[0];
  }

  @Patch(':id')
  @Roles('admin')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<CreatePropertyDto>, @TenantSchema() schema: string) {
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (dto.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(dto.name); }
    if (dto.description !== undefined) { sets.push(`description = $${idx++}`); vals.push(dto.description); }
    if (dto.address !== undefined) { sets.push(`address = $${idx++}`); vals.push(dto.address); }
    if (dto.lat !== undefined) { sets.push(`lat = $${idx++}`); vals.push(dto.lat); }
    if (dto.lng !== undefined) { sets.push(`lng = $${idx++}`); vals.push(dto.lng); }
    if (dto.capacity !== undefined) { sets.push(`capacity = $${idx++}`); vals.push(dto.capacity); }
    if (dto.bedrooms !== undefined) { sets.push(`bedrooms = $${idx++}`); vals.push(dto.bedrooms); }
    if (dto.bathrooms !== undefined) { sets.push(`bathrooms = $${idx++}`); vals.push(dto.bathrooms); }
    if (dto.amenities !== undefined) { sets.push(`amenities = $${idx++}::jsonb`); vals.push(JSON.stringify(dto.amenities)); }
    if (dto.rules !== undefined) { sets.push(`rules = $${idx++}::jsonb`); vals.push(JSON.stringify(dto.rules)); }
    if (dto.images !== undefined) { sets.push(`images = $${idx++}::jsonb`); vals.push(JSON.stringify(dto.images)); }
    if (dto.pricePerNight !== undefined) { sets.push(`price_per_night = $${idx++}`); vals.push(dto.pricePerNight); }
    if (dto.pricePerWeek !== undefined) { sets.push(`price_per_week = $${idx++}`); vals.push(dto.pricePerWeek); }
    if (dto.pricePerMonth !== undefined) { sets.push(`price_per_month = $${idx++}`); vals.push(dto.pricePerMonth); }
    if (dto.minNights !== undefined) { sets.push(`min_nights = $${idx++}`); vals.push(dto.minNights); }

    if (sets.length === 0) return { success: true };

    sets.push(`updated_at = NOW()`);
    vals.push(id);

    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schema}".properties SET ${sets.join(', ')} WHERE id = $${idx}::uuid`,
      ...vals,
    );
    return { success: true };
  }

  @Delete(':id')
  @Roles('admin')
  async delete(@Param('id', ParseUUIDPipe) id: string, @TenantSchema() schema: string) {
    await this.prisma.$executeRawUnsafe(`DELETE FROM "${schema}".properties WHERE id = $1::uuid`, id);
    return { success: true };
  }
}
