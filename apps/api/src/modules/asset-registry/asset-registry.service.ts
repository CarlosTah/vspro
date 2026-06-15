import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export type AssetType = 'vehicle' | 'pet' | 'appliance' | 'property' | 'other';

export interface CreateAssetDto {
  customerId: string;
  type: AssetType;
  name: string;
  details: Record<string, any>; // {make, model, year, plate, color} or {breed, age, weight}
  notes?: string;
}

/**
 * Asset Registry — Vehicles, Pets, Appliances linked to customers.
 * Used by: talleres (Jetta GLI 2020, placas XYZ), vets (Max, Golden Retriever, 3 años)
 */
@Injectable()
export class AssetRegistryService {
  private readonly logger = new Logger(AssetRegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAssetDto, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".asset_registry (customer_id, type, name, details, notes)
      VALUES ($1::uuid, $2, $3, $4::jsonb, $5)
      RETURNING id, type, name, details, created_at AS "createdAt"
    `, dto.customerId, dto.type, dto.name, JSON.stringify(dto.details), dto.notes ?? null);
    return rows[0];
  }

  async getByCustomer(customerId: string, schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, type, name, details, notes, created_at AS "createdAt"
      FROM "${schemaName}".asset_registry WHERE customer_id = $1::uuid ORDER BY created_at DESC
    `, customerId);
  }

  async findById(id: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT a.*, c.name AS "customerName" FROM "${schemaName}".asset_registry a
      JOIN "${schemaName}".customers c ON c.id = a.customer_id WHERE a.id = $1::uuid
    `, id);
    if (!rows[0]) throw new NotFoundException('Asset not found');
    return rows[0];
  }

  async update(id: string, details: Record<string, any>, schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".asset_registry SET details = details || $1::jsonb, updated_at = NOW() WHERE id = $2::uuid
    `, JSON.stringify(details), id);
    return this.findById(id, schemaName);
  }

  async getServiceHistory(assetId: string, schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT sr.id, sr.service_name, sr.last_completed_at, sr.next_due_date
      FROM "${schemaName}".service_reminders sr WHERE sr.asset_id = $1 ORDER BY sr.last_completed_at DESC
    `, assetId);
  }
}
