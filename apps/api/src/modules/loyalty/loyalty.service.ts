import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Loyalty Service — Customer segmentation & re-engagement engine.
 *
 * Features:
 * - customer-segmentation: Classifies customers by purchase behavior
 * - re-engagement-engine: Identifies at-risk/churned customers for outreach
 * - whatsapp-template-sender: Sends approved templates outside 24h window
 *
 * Segments:
 * - VIP: 5+ orders AND avg < 20 days between purchases
 * - Active: 2+ orders in last 60 days
 * - At-risk: Last order 30-60 days ago
 * - Churned: Last order > 60 days ago
 * - New: Only 1 order ever
 *
 * Schema tables: customers, orders, conversations
 */
@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Customer Segmentation ────────────────────────────────────

  /**
   * Segment all customers for a tenant.
   */
  async segmentCustomers(schemaName: string): Promise<SegmentationResult> {
    const customers = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        c.id, c.name, c.phone, c.channel_type, c.channel_id,
        COUNT(o.id) AS order_count,
        COALESCE(SUM(o.total), 0) AS lifetime_value,
        MAX(o.created_at) AS last_order_at,
        MIN(o.created_at) AS first_order_at
      FROM "${schemaName}".customers c
      LEFT JOIN "${schemaName}".orders o ON o.customer_id = c.id AND o.status != 'cancelled'
      GROUP BY c.id, c.name, c.phone, c.channel_type, c.channel_id
    `);

    const now = Date.now();
    const segments: Record<CustomerSegment, SegmentedCustomer[]> = {
      vip: [], active: [], at_risk: [], churned: [], new: [], inactive: [],
    };

    for (const c of customers) {
      const orderCount = parseInt(c.order_count ?? '0');
      const ltv = parseFloat(c.lifetime_value ?? '0');
      const lastOrderAt = c.last_order_at ? new Date(c.last_order_at).getTime() : 0;
      const daysSinceLastOrder = lastOrderAt ? (now - lastOrderAt) / 86400000 : Infinity;
      const firstOrderAt = c.first_order_at ? new Date(c.first_order_at).getTime() : 0;
      const customerAge = firstOrderAt ? (now - firstOrderAt) / 86400000 : 0;
      const avgDaysBetween = orderCount > 1 ? customerAge / (orderCount - 1) : Infinity;

      let segment: CustomerSegment;

      if (orderCount >= 5 && avgDaysBetween < 20) {
        segment = 'vip';
      } else if (orderCount >= 2 && daysSinceLastOrder <= 60) {
        segment = 'active';
      } else if (orderCount >= 1 && daysSinceLastOrder > 30 && daysSinceLastOrder <= 60) {
        segment = 'at_risk';
      } else if (orderCount >= 1 && daysSinceLastOrder > 60) {
        segment = 'churned';
      } else if (orderCount === 1) {
        segment = 'new';
      } else {
        segment = 'inactive';
      }

      segments[segment].push({
        id: c.id,
        name: c.name,
        phone: c.phone,
        channelType: c.channel_type,
        channelId: c.channel_id,
        orderCount,
        lifetimeValue: ltv,
        daysSinceLastOrder: Math.round(daysSinceLastOrder),
        segment,
      });
    }

    return {
      total: customers.length,
      segments: {
        vip: segments.vip.length,
        active: segments.active.length,
        at_risk: segments.at_risk.length,
        churned: segments.churned.length,
        new: segments.new.length,
        inactive: segments.inactive.length,
      },
      customers: segments,
    };
  }

  /**
   * Get customers needing re-engagement (at_risk + churned).
   */
  async getReEngagementTargets(schemaName: string): Promise<ReEngagementTarget[]> {
    const result = await this.segmentCustomers(schemaName);
    const targets: ReEngagementTarget[] = [];

    // At-risk: send "we miss you" message
    for (const c of result.customers.at_risk) {
      targets.push({
        ...c,
        action: 'soft_reminder',
        templateName: 're_engagement_miss_you',
        message: this.buildReEngagementMessage(c, 'at_risk'),
      });
    }

    // Churned: send special offer
    for (const c of result.customers.churned) {
      targets.push({
        ...c,
        action: 'win_back_offer',
        templateName: 're_engagement_offer',
        message: this.buildReEngagementMessage(c, 'churned'),
      });
    }

    // VIP without recent order (> 15 days): gentle check-in
    for (const c of result.customers.vip) {
      if (c.daysSinceLastOrder > 15) {
        targets.push({
          ...c,
          action: 'vip_check_in',
          templateName: 're_engagement_vip',
          message: this.buildReEngagementMessage(c, 'vip_inactive'),
        });
      }
    }

    return targets;
  }

  /**
   * Get loyalty stats for dashboard.
   */
  async getLoyaltyStats(schemaName: string): Promise<LoyaltyStats> {
    const result = await this.segmentCustomers(schemaName);

    const vipRevenue = result.customers.vip.reduce((s, c) => s + c.lifetimeValue, 0);
    const totalRevenue = Object.values(result.customers).flat().reduce((s, c) => s + c.lifetimeValue, 0);

    return {
      totalCustomers: result.total,
      segments: result.segments,
      vipRevenueShare: totalRevenue > 0 ? Math.round((vipRevenue / totalRevenue) * 100) : 0,
      atRiskCount: result.segments.at_risk,
      churnedCount: result.segments.churned,
      reEngagementOpportunities: result.segments.at_risk + result.segments.churned,
    };
  }

  // ─── Message Builders ─────────────────────────────────────────

  private buildReEngagementMessage(customer: SegmentedCustomer, type: string): string {
    const name = customer.name?.split(' ')[0] ?? 'Cliente';

    switch (type) {
      case 'at_risk':
        return `Hola ${name} 👋\n\n¡Te extrañamos! Hace ${customer.daysSinceLastOrder} días que no nos visitas.\n\nTenemos novedades que te van a encantar. ¿Te muestro lo nuevo? 🛍️`;

      case 'churned':
        return `Hola ${name} 👋\n\n¡Ha pasado tiempo! Queremos darte un 15% de descuento en tu próxima compra como agradecimiento por ser parte de nuestra comunidad.\n\nUsa el código: VUELVE15\n\n¿Te interesa ver nuestro catálogo? ✨`;

      case 'vip_inactive':
        return `Hola ${name} 🌟\n\n¡Eres de nuestros clientes favoritos! Tenemos productos nuevos que creemos te van a encantar.\n\n¿Quieres que te muestre las novedades? 💜`;

      default:
        return `Hola ${name}, tenemos algo especial para ti. ¿Platicamos? 😊`;
    }
  }
}

// ─── Types ──────────────────────────────────────────────────────

export type CustomerSegment = 'vip' | 'active' | 'at_risk' | 'churned' | 'new' | 'inactive';

export interface SegmentedCustomer {
  id: string;
  name: string;
  phone: string;
  channelType: string;
  channelId: string;
  orderCount: number;
  lifetimeValue: number;
  daysSinceLastOrder: number;
  segment: CustomerSegment;
}

export interface ReEngagementTarget extends SegmentedCustomer {
  action: string;
  templateName: string;
  message: string;
}

export interface SegmentationResult {
  total: number;
  segments: Record<CustomerSegment, number>;
  customers: Record<CustomerSegment, SegmentedCustomer[]>;
}

export interface LoyaltyStats {
  totalCustomers: number;
  segments: Record<CustomerSegment, number>;
  vipRevenueShare: number;
  atRiskCount: number;
  churnedCount: number;
  reEngagementOpportunities: number;
}
