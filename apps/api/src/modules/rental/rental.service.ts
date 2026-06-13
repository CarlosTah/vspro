import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CheckAvailabilityDto, CreateReservationDto } from './dto/check-availability.dto';

export interface AvailabilityResult {
  available: boolean;
  productId: string;
  productName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  pricePerNight: number;
  totalPrice: number;
  blockedDates?: string[];
}

@Injectable()
export class RentalService {
  private readonly logger = new Logger(RentalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifica disponibilidad de una propiedad/habitación para las fechas solicitadas.
   * Revisa: blocking_dates del inventario + reservaciones existentes (pedidos activos).
   */
  async checkAvailability(
    dto: CheckAvailabilityDto,
    schemaName: string,
  ): Promise<AvailabilityResult> {
    // 1. Obtener producto y su inventario
    const products = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.name, p.price,
             i.blocking_dates AS "blockingDates",
             i.stock_available AS "stockAvailable"
      FROM "${schemaName}".products p
      JOIN "${schemaName}".inventory i ON i.product_id = p.id
      WHERE p.id = $1::uuid AND p.is_active = true
    `, dto.productId);

    if (!products[0]) throw new BadRequestException('Propiedad no encontrada');

    const product = products[0];
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    if (nights < 1) throw new BadRequestException('Check-out debe ser después de check-in');

    // 2. Verificar fechas bloqueadas
    const blockingDates: string[] = product.blockingDates ?? [];
    const requestedDates = this.getDateRange(checkIn, checkOut);
    const conflictDates = requestedDates.filter((d) => blockingDates.includes(d));

    // 3. Verificar reservaciones existentes (pedidos activos con esas fechas)
    const existingReservations = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.id, o.notes
      FROM "${schemaName}".orders o
      WHERE o.status NOT IN ('cancelled', 'delivered')
        AND o.items::text LIKE $1
        AND o.notes LIKE '%checkIn%'
    `, `%${dto.productId}%`);

    const available = conflictDates.length === 0 && product.stockAvailable > 0;
    const pricePerNight = parseFloat(product.price);

    return {
      available,
      productId: product.id,
      productName: product.name,
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      nights,
      pricePerNight,
      totalPrice: pricePerNight * nights,
      blockedDates: conflictDates.length > 0 ? conflictDates : undefined,
    };
  }

  /**
   * Crea una reservación (pedido especial con fechas).
   */
  async createReservation(dto: CreateReservationDto, schemaName: string) {
    // Verificar disponibilidad primero
    const availability = await this.checkAvailability(
      { productId: dto.productId, checkIn: dto.checkIn, checkOut: dto.checkOut, guests: dto.guests },
      schemaName,
    );

    if (!availability.available) {
      throw new BadRequestException(
        `La propiedad no está disponible para las fechas seleccionadas. Fechas bloqueadas: ${availability.blockedDates?.join(', ')}`,
      );
    }

    // Crear pedido como reservación
    const orderNumber = `RES-${Date.now().toString(36).toUpperCase()}`;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".orders
        (order_number, customer_id, channel_type, status, items, subtotal, total, notes)
      VALUES ($1, $2::uuid, 'whatsapp', 'new', $3::jsonb, $4, $4, $5)
      RETURNING id, order_number AS "orderNumber", status, total
    `,
      orderNumber,
      dto.customerId,
      JSON.stringify([{
        productId: dto.productId,
        productName: availability.productName,
        quantity: availability.nights,
        unitPrice: availability.pricePerNight,
        subtotal: availability.totalPrice,
        type: 'reservation',
        checkIn: dto.checkIn,
        checkOut: dto.checkOut,
        guests: dto.guests,
      }]),
      availability.totalPrice,
      JSON.stringify({ checkIn: dto.checkIn, checkOut: dto.checkOut, guests: dto.guests, notes: dto.notes }),
    );

    // Bloquear las fechas en el inventario
    await this.blockDates(dto.productId, dto.checkIn, dto.checkOut, schemaName);

    return {
      reservation: rows[0],
      details: {
        property: availability.productName,
        checkIn: dto.checkIn,
        checkOut: dto.checkOut,
        nights: availability.nights,
        guests: dto.guests,
        totalPrice: availability.totalPrice,
      },
    };
  }

  /**
   * Obtiene el calendario de disponibilidad de una propiedad (próximos 60 días).
   */
  async getCalendar(productId: string, schemaName: string) {
    const products = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT i.blocking_dates AS "blockingDates"
      FROM "${schemaName}".inventory i
      WHERE i.product_id = $1::uuid
    `, productId);

    const blockingDates: string[] = products[0]?.blockingDates ?? [];

    // Generar próximos 60 días
    const calendar = [];
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      calendar.push({
        date: dateStr,
        available: !blockingDates.includes(dateStr),
      });
    }

    return { productId, calendar };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async blockDates(
    productId: string,
    checkIn: string,
    checkOut: string,
    schemaName: string,
  ) {
    const dates = this.getDateRange(new Date(checkIn), new Date(checkOut));

    // Agregar fechas al array de blocking_dates
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".inventory
      SET blocking_dates = (
        SELECT jsonb_agg(DISTINCT d)
        FROM (
          SELECT jsonb_array_elements(COALESCE(blocking_dates, '[]'::jsonb)) AS d
          UNION ALL
          SELECT jsonb_array_elements($1::jsonb) AS d
        ) sub
      )
      WHERE product_id = $2::uuid
    `, JSON.stringify(dates), productId);
  }

  private getDateRange(start: Date, end: Date): string[] {
    const dates: string[] = [];
    const current = new Date(start);
    while (current < end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }
}
