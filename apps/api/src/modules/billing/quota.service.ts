import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { QUOTA_WARNING_THRESHOLD } from '@vspro/shared';
import { UsageType } from '../../common/decorators/track-usage.decorator';

/** Mapeo de UsageType a campo en usage_records y campo en plan.features */
const USAGE_FIELD_MAP: Record<UsageType, { dbField: string; planField: string }> = {
  orders: { dbField: 'ordersCount', planField: 'maxOrdersPerMonth' },
  messages: { dbField: 'messagesSent', planField: 'maxMessagesPerMonth' },
  ai: { dbField: 'aiCalls', planField: 'maxAiCallsPerMonth' },
  ocr: { dbField: 'ocrCalls', planField: 'maxOcrCallsPerMonth' },
};

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifica si el tenant tiene quota disponible para el tipo de uso.
   * Retorna true si puede proceder, false si excedió el límite.
   */
  async checkQuota(tenantId: string, type: UsageType): Promise<{
    allowed: boolean;
    current: number;
    limit: number | null;
    percentage: number;
  }> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { plan: true },
    });

    const features = tenant.plan.features as Record<string, any>;
    const mapping = USAGE_FIELD_MAP[type];
    const limit: number | null = features[mapping.planField] ?? null;

    // null = ilimitado
    if (limit === null) {
      return { allowed: true, current: 0, limit: null, percentage: 0 };
    }

    // Obtener uso actual del mes
    const period = this.getCurrentPeriod();
    const usage = await this.prisma.usageRecord.findUnique({
      where: { tenantId_period: { tenantId, period } },
    });

    const current = usage ? (usage as any)[mapping.dbField] ?? 0 : 0;
    const percentage = limit > 0 ? current / limit : 0;

    return {
      allowed: current < limit,
      current,
      limit,
      percentage,
    };
  }

  /**
   * Incrementa el contador de uso del tenant.
   * Se llama DESPUÉS de que la operación se ejecutó exitosamente.
   */
  async increment(tenantId: string, type: UsageType): Promise<void> {
    const period = this.getCurrentPeriod();
    const mapping = USAGE_FIELD_MAP[type];

    // Upsert: crear registro si no existe, incrementar si existe
    await this.prisma.usageRecord.upsert({
      where: { tenantId_period: { tenantId, period } },
      create: {
        tenantId,
        period,
        [mapping.dbField]: 1,
      },
      update: {
        [mapping.dbField]: { increment: 1 },
      },
    });

    // Verificar si se acerca al límite (80%) para alertar
    const { percentage, limit, current } = await this.checkQuota(tenantId, type);
    if (limit && percentage >= QUOTA_WARNING_THRESHOLD) {
      this.logger.warn(
        `Tenant ${tenantId} al ${Math.round(percentage * 100)}% de quota ${type} (${current + 1}/${limit})`,
      );
    }
  }

  /**
   * Obtiene el resumen de uso del tenant para el mes actual.
   */
  async getUsageSummary(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { plan: true },
    });

    const period = this.getCurrentPeriod();
    const usage = await this.prisma.usageRecord.findUnique({
      where: { tenantId_period: { tenantId, period } },
    });

    const features = tenant.plan.features as Record<string, any>;

    return {
      period: period.toISOString().split('T')[0],
      plan: tenant.plan.slug,
      usage: {
        orders: {
          current: usage?.ordersCount ?? 0,
          limit: features.maxOrdersPerMonth ?? null,
        },
        messages: {
          current: usage?.messagesSent ?? 0,
          limit: features.maxMessagesPerMonth ?? null,
        },
        ai: {
          current: usage?.aiCalls ?? 0,
          limit: features.maxAiCallsPerMonth ?? null,
        },
        ocr: {
          current: usage?.ocrCalls ?? 0,
          limit: features.maxOcrCallsPerMonth ?? null,
        },
      },
    };
  }

  private getCurrentPeriod(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}
