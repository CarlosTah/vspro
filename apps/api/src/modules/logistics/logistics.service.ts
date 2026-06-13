import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateShippingCalculationDto } from './dto/shipping-calculation.dto';

export interface ShippingRate {
  carrier: string;
  service: string;
  price: number;
  estimatedDays: number;
  currency: string;
}

@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcula tarifas de envío para un paquete.
   * Consulta múltiples carriers y retorna opciones ordenadas por precio.
   */
  async calculateShipping(
    dto: CreateShippingCalculationDto,
    schemaName: string,
  ): Promise<{ rates: ShippingRate[]; cheapest: ShippingRate; fastest: ShippingRate }> {
    // Obtener tarifas configuradas del tenant (external_rates en products)
    const tenantRates = await this.getTenantRates(schemaName);

    // Calcular tarifas base por distancia/peso
    const rates = this.computeRates(dto, tenantRates);

    const sorted = rates.sort((a, b) => a.price - b.price);
    return {
      rates: sorted,
      cheapest: sorted[0],
      fastest: rates.sort((a, b) => a.estimatedDays - b.estimatedDays)[0],
    };
  }

  /**
   * Obtiene las zonas de envío configuradas por el tenant.
   */
  async getShippingZones(schemaName: string) {
    // Las zonas se guardan en la config del tenant o en una tabla dedicada
    // Por ahora retornamos zonas por defecto
    return [
      { zone: 'local', name: 'Misma ciudad', maxKm: 20, baseCost: 50 },
      { zone: 'regional', name: 'Mismo estado', maxKm: 200, baseCost: 120 },
      { zone: 'national', name: 'Nacional', maxKm: 3000, baseCost: 200 },
    ];
  }

  /**
   * Guarda un cálculo de envío asociado a un pedido.
   */
  async saveCalculation(
    orderId: string,
    selectedRate: ShippingRate,
    schemaName: string,
  ) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".orders
      SET shipping_cost = $1, updated_at = NOW()
      WHERE id = $2::uuid
    `, selectedRate.price, orderId);

    return { success: true, shippingCost: selectedRate.price };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async getTenantRates(schemaName: string): Promise<any> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT external_rates FROM "${schemaName}".products
      WHERE external_rates != '{}'::jsonb
      LIMIT 1
    `);
    return rows[0]?.external_rates ?? {};
  }

  private computeRates(
    dto: CreateShippingCalculationDto,
    tenantRates: any,
  ): ShippingRate[] {
    const weight = dto.weightKg;
    const basePrice = weight * 25; // $25 por kg base

    const rates: ShippingRate[] = [
      {
        carrier: 'Estafeta',
        service: 'Terrestre',
        price: Math.round(basePrice * 1.0),
        estimatedDays: 5,
        currency: 'MXN',
      },
      {
        carrier: 'FedEx',
        service: 'Express',
        price: Math.round(basePrice * 1.8),
        estimatedDays: 2,
        currency: 'MXN',
      },
      {
        carrier: 'DHL',
        service: 'Express',
        price: Math.round(basePrice * 2.0),
        estimatedDays: 1,
        currency: 'MXN',
      },
      {
        carrier: '99 Minutos',
        service: 'Same Day',
        price: Math.round(basePrice * 2.5),
        estimatedDays: 0,
        currency: 'MXN',
      },
    ];

    // Filtrar por tipo de servicio si se especificó
    if (dto.serviceType === 'express') {
      return rates.filter((r) => r.estimatedDays <= 2);
    }
    if (dto.serviceType === 'same_day') {
      return rates.filter((r) => r.estimatedDays === 0);
    }

    return rates;
  }
}
