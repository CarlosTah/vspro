import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ChannelType } from '@vspro/shared';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, name, phone, email,
        channel_type AS "channelType",
        channel_id   AS "channelId",
        address, notes,
        created_at   AS "createdAt"
      FROM "${schemaName}".customers
      ORDER BY created_at DESC
    `);
  }

  async findById(id: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, name, phone, email,
        channel_type AS "channelType",
        channel_id   AS "channelId",
        address, notes,
        created_at   AS "createdAt"
      FROM "${schemaName}".customers
      WHERE id = $1::uuid
    `, id);

    if (!rows[0]) throw new NotFoundException(`Cliente ${id} no encontrado`);
    return rows[0];
  }

  /**
   * Busca un cliente por su canal e ID en ese canal.
   * Si no existe, lo crea automáticamente (upsert).
   * Se usa cuando llega un mensaje nuevo de un cliente desconocido.
   */
  async findOrCreateByChannel(
    channelType: ChannelType,
    channelId: string,
    name: string | undefined,
    schemaName: string,
  ) {
    const existing = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, phone, email,
             channel_type AS "channelType",
             channel_id   AS "channelId"
      FROM "${schemaName}".customers
      WHERE channel_type = $1 AND channel_id = $2
    `, channelType, channelId);

    if (existing[0]) return existing[0];

    // Crear cliente nuevo
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".customers (name, channel_type, channel_id)
      VALUES ($1, $2, $3)
      RETURNING id, name, channel_type AS "channelType", channel_id AS "channelId", created_at AS "createdAt"
    `, name ?? null, channelType, channelId);

    return rows[0];
  }

  async create(dto: CreateCustomerDto, schemaName: string) {
    // Verificar que no exista ya ese canal+id
    const existing = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id FROM "${schemaName}".customers
      WHERE channel_type = $1 AND channel_id = $2
    `, dto.channelType, dto.channelId);

    if (existing.length > 0) {
      throw new ConflictException(
        `Ya existe un cliente con ${dto.channelType} ID: ${dto.channelId}`,
      );
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".customers
        (name, phone, email, channel_type, channel_id, address, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, phone, email,
                channel_type AS "channelType",
                channel_id   AS "channelId",
                address, notes,
                created_at   AS "createdAt"
    `,
      dto.name ?? null,
      dto.phone ?? null,
      dto.email ?? null,
      dto.channelType,
      dto.channelId,
      dto.address ? JSON.stringify(dto.address) : null,
      dto.notes ?? null,
    );

    return rows[0];
  }

  async update(id: string, dto: Partial<CreateCustomerDto>, schemaName: string) {
    await this.findById(id, schemaName);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.name !== undefined)    { fields.push(`name = $${idx++}`);    values.push(dto.name); }
    if (dto.phone !== undefined)   { fields.push(`phone = $${idx++}`);   values.push(dto.phone); }
    if (dto.email !== undefined)   { fields.push(`email = $${idx++}`);   values.push(dto.email); }
    if (dto.address !== undefined) { fields.push(`address = $${idx++}`); values.push(JSON.stringify(dto.address)); }
    if (dto.notes !== undefined)   { fields.push(`notes = $${idx++}`);   values.push(dto.notes); }

    if (fields.length === 0) return this.findById(id, schemaName);

    values.push(id);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".customers SET ${fields.join(', ')} WHERE id = $${idx}::uuid`,
      ...values,
    );

    return this.findById(id, schemaName);
  }

  async getOrderHistory(customerId: string, schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, order_number AS "orderNumber", status,
        total, created_at AS "createdAt"
      FROM "${schemaName}".orders
      WHERE customer_id = $1::uuid
      ORDER BY created_at DESC
    `, customerId);
  }
}
