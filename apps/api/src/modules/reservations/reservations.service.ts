import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface CreateReservationDto {
  propertyId?: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guests?: number;
  notes?: string;
  totalPrice?: number;
}

export interface PricingRuleDto {
  propertyId?: string;
  dateFrom?: string;
  dateTo?: string;
  pricePerNight: number;
  pricePerWeek?: number;
  pricePerMonth?: number;
  minNights?: number;
  label?: string; // "Temporada alta", "Año nuevo", etc.
}

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureTables(schema: string) {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schema}".reservations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        property_id UUID,
        guest_name VARCHAR(255) NOT NULL,
        guest_phone VARCHAR(50),
        guest_email VARCHAR(255),
        check_in DATE NOT NULL,
        check_out DATE NOT NULL,
        nights INTEGER NOT NULL DEFAULT 1,
        guests INTEGER NOT NULL DEFAULT 1,
        total_price DECIMAL(10,2) NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schema}".pricing_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        property_id UUID,
        date_from DATE,
        date_to DATE,
        price_per_night DECIMAL(10,2) NOT NULL,
        price_per_week DECIMAL(10,2),
        price_per_month DECIMAL(10,2),
        min_nights INTEGER NOT NULL DEFAULT 1,
        label VARCHAR(100),
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  // ─── Reservations CRUD ────────────────────────────────────────

  async list(schema: string) {
    await this.ensureTables(schema);
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, property_id AS "propertyId", guest_name AS "guestName",
             guest_phone AS "guestPhone", guest_email AS "guestEmail",
             check_in AS "checkIn", check_out AS "checkOut",
             nights, guests, total_price AS "totalPrice", status, notes,
             created_at AS "createdAt"
      FROM "${schema}".reservations
      ORDER BY check_in DESC
      LIMIT 200
    `);
  }

  async create(dto: CreateReservationDto, schema: string) {
    await this.ensureTables(schema);

    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);
    if (checkOut <= checkIn) throw new BadRequestException('Check-out debe ser después de check-in');

    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (86400000));

    // Check availability
    const conflicts = await this.checkConflicts(dto.checkIn, dto.checkOut, schema, dto.propertyId);
    if (conflicts.length > 0) {
      throw new BadRequestException(`Fechas no disponibles. Hay ${conflicts.length} reserva(s) en ese rango.`);
    }

    // Calculate price
    const totalPrice = dto.totalPrice ?? await this.calculatePrice(dto.checkIn, dto.checkOut, schema, dto.propertyId);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schema}".reservations
        (property_id, guest_name, guest_phone, guest_email, check_in, check_out, nights, guests, total_price, notes, status)
      VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, 'confirmed')
      RETURNING id, guest_name AS "guestName", check_in AS "checkIn", check_out AS "checkOut",
                nights, total_price AS "totalPrice", status
    `, dto.propertyId ?? null, dto.guestName, dto.guestPhone ?? null, dto.guestEmail ?? null,
       dto.checkIn, dto.checkOut, nights, dto.guests ?? 1, totalPrice, dto.notes ?? null);

    return rows[0];
  }

  async updateStatus(id: string, status: string, schema: string) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schema}".reservations SET status = $1, updated_at = NOW() WHERE id = $2::uuid
    `, status, id);
    return { success: true };
  }

  async delete(id: string, schema: string) {
    await this.prisma.$executeRawUnsafe(`DELETE FROM "${schema}".reservations WHERE id = $1::uuid`, id);
    return { success: true };
  }

  // ─── Availability ─────────────────────────────────────────────

  async checkAvailability(checkIn: string, checkOut: string, schema: string, propertyId?: string): Promise<{ available: boolean; conflicts: any[] }> {
    await this.ensureTables(schema);
    const conflicts = await this.checkConflicts(checkIn, checkOut, schema, propertyId);
    return { available: conflicts.length === 0, conflicts };
  }

  private async checkConflicts(checkIn: string, checkOut: string, schema: string, propertyId?: string) {
    const propFilter = propertyId ? `AND (property_id = '${propertyId}' OR property_id IS NULL)` : '';
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, guest_name AS "guestName", check_in AS "checkIn", check_out AS "checkOut"
      FROM "${schema}".reservations
      WHERE status IN ('confirmed', 'pending')
        AND check_in < $2::date AND check_out > $1::date
        ${propFilter}
    `, checkIn, checkOut);
  }

  // ─── Pricing ──────────────────────────────────────────────────

  async getPricingRules(schema: string) {
    await this.ensureTables(schema);
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, property_id AS "propertyId", date_from AS "dateFrom", date_to AS "dateTo",
             price_per_night AS "pricePerNight", price_per_week AS "pricePerWeek",
             price_per_month AS "pricePerMonth",
             min_nights AS "minNights", label, is_default AS "isDefault"
      FROM "${schema}".pricing_rules
      ORDER BY is_default DESC, date_from ASC
    `);
  }

  async createPricingRule(dto: PricingRuleDto, schema: string) {
    await this.ensureTables(schema);
    // Add columns if missing (for existing tenants)
    await this.prisma.$executeRawUnsafe(`ALTER TABLE "${schema}".pricing_rules ADD COLUMN IF NOT EXISTS price_per_week DECIMAL(10,2)`);
    await this.prisma.$executeRawUnsafe(`ALTER TABLE "${schema}".pricing_rules ADD COLUMN IF NOT EXISTS price_per_month DECIMAL(10,2)`);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schema}".pricing_rules (property_id, date_from, date_to, price_per_night, price_per_week, price_per_month, min_nights, label, is_default)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, price_per_night AS "pricePerNight", price_per_week AS "pricePerWeek",
                price_per_month AS "pricePerMonth", label, is_default AS "isDefault"
    `, dto.propertyId ?? null, dto.dateFrom ?? null, dto.dateTo ?? null,
       dto.pricePerNight, dto.pricePerWeek ?? null, dto.pricePerMonth ?? null,
       dto.minNights ?? 1, dto.label ?? null,
       (!dto.dateFrom && !dto.dateTo)); // is_default if no dates specified

    return rows[0];
  }

  async deletePricingRule(id: string, schema: string) {
    await this.prisma.$executeRawUnsafe(`DELETE FROM "${schema}".pricing_rules WHERE id = $1::uuid`, id);
    return { success: true };
  }

  async calculatePrice(checkIn: string, checkOut: string, schema: string, propertyId?: string): Promise<number> {
    const rules = await this.getPricingRules(schema);
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const nights = Math.ceil((end.getTime() - start.getTime()) / 86400000);

    const defaultRule = rules.find(r => r.isDefault);
    const basePrice = defaultRule ? parseFloat(defaultRule.pricePerNight) : 0;
    const weeklyPrice = defaultRule?.pricePerWeek ? parseFloat(defaultRule.pricePerWeek) : null;
    const monthlyPrice = defaultRule?.pricePerMonth ? parseFloat(defaultRule.pricePerMonth) : null;

    // Apply best rate: monthly > weekly > nightly
    if (monthlyPrice && nights >= 30) {
      const months = Math.floor(nights / 30);
      const remainingNights = nights % 30;
      return (months * monthlyPrice) + (remainingNights * basePrice);
    }

    if (weeklyPrice && nights >= 7) {
      const weeks = Math.floor(nights / 7);
      const remainingNights = nights % 7;
      return (weeks * weeklyPrice) + (remainingNights * basePrice);
    }

    // Calculate night by night with seasonal pricing
    let total = 0;
    const current = new Date(start);
    while (current < end) {
      const dateStr = current.toISOString().split('T')[0];
      const seasonalRule = rules.find(r =>
        !r.isDefault && r.dateFrom && r.dateTo &&
        dateStr >= r.dateFrom && dateStr <= r.dateTo
      );
      total += seasonalRule ? parseFloat(seasonalRule.pricePerNight) : basePrice;
      current.setDate(current.getDate() + 1);
    }

    return total;
  }

  // ─── Calendar data ────────────────────────────────────────────

  async getCalendarData(year: number, month: number, schema: string) {
    await this.ensureTables(schema);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const reservations = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, guest_name AS "guestName", check_in AS "checkIn", check_out AS "checkOut",
             status, total_price AS "totalPrice"
      FROM "${schema}".reservations
      WHERE status IN ('confirmed', 'pending')
        AND check_in < $2::date AND check_out > $1::date
      ORDER BY check_in
    `, startDate, endDate);

    return { year, month, reservations };
  }
}
