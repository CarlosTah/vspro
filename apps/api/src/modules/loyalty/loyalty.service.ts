import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface LoyaltyConfig {
  id: string;
  isEnabled: boolean;
  pointsPerCurrency: number;
  redemptionRate: number;
  welcomeBonus: number;
  tiers: LoyaltyTier[];
  rewards: LoyaltyReward[];
}

export interface LoyaltyTier {
  name: string;
  minPoints: number;
  multiplier: number;
}

export interface LoyaltyReward {
  name: string;
  pointsCost: number;
  type: 'discount_fixed' | 'discount_percent' | 'free_product' | 'free_shipping';
  value: number; // $ amount, % amount, or product qty
  productName?: string;
}

export interface CustomerLoyalty {
  customerId: string;
  customerName: string;
  totalPoints: number;
  currentTier: string;
  nextTier: string | null;
  pointsToNextTier: number;
  totalEarned: number;
  totalRedeemed: number;
}

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureTables(schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".loyalty_config (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        is_enabled            BOOLEAN NOT NULL DEFAULT false,
        points_per_currency   DECIMAL(5,2) NOT NULL DEFAULT 1,
        redemption_rate       DECIMAL(5,2) NOT NULL DEFAULT 10,
        welcome_bonus         INTEGER NOT NULL DEFAULT 0,
        tiers                 JSONB NOT NULL DEFAULT '[{"name":"Bronce","minPoints":0,"multiplier":1},{"name":"Plata","minPoints":500,"multiplier":1.5},{"name":"Oro","minPoints":2000,"multiplier":2}]',
        rewards               JSONB NOT NULL DEFAULT '[]',
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".loyalty_transactions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id     UUID NOT NULL REFERENCES "${schemaName}".customers(id),
        type            VARCHAR(50) NOT NULL,
        points          INTEGER NOT NULL,
        balance_after   INTEGER NOT NULL DEFAULT 0,
        description     TEXT,
        order_id        UUID,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON "${schemaName}".loyalty_transactions(customer_id)
    `);
  }

  // ─── Config ─────────────────────────────────────────────────────

  async getConfig(schemaName: string): Promise<LoyaltyConfig> {
    await this.ensureTables(schemaName);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, is_enabled AS "isEnabled", points_per_currency AS "pointsPerCurrency",
             redemption_rate AS "redemptionRate", welcome_bonus AS "welcomeBonus",
             tiers, rewards, updated_at AS "updatedAt"
      FROM "${schemaName}".loyalty_config LIMIT 1
    `);

    if (!rows[0]) {
      // Create default config
      const created = await this.prisma.$queryRawUnsafe<any[]>(`
        INSERT INTO "${schemaName}".loyalty_config (is_enabled) VALUES (false)
        RETURNING id, is_enabled AS "isEnabled", points_per_currency AS "pointsPerCurrency",
                  redemption_rate AS "redemptionRate", welcome_bonus AS "welcomeBonus",
                  tiers, rewards
      `);
      return this.parseConfig(created[0]);
    }
    return this.parseConfig(rows[0]);
  }

  async updateConfig(schemaName: string, updates: Partial<LoyaltyConfig>) {
    await this.ensureTables(schemaName);
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.isEnabled !== undefined) { fields.push(`is_enabled = $${idx++}`); values.push(updates.isEnabled); }
    if (updates.pointsPerCurrency !== undefined) { fields.push(`points_per_currency = $${idx++}`); values.push(updates.pointsPerCurrency); }
    if (updates.redemptionRate !== undefined) { fields.push(`redemption_rate = $${idx++}`); values.push(updates.redemptionRate); }
    if (updates.welcomeBonus !== undefined) { fields.push(`welcome_bonus = $${idx++}`); values.push(updates.welcomeBonus); }
    if (updates.tiers !== undefined) { fields.push(`tiers = $${idx++}::jsonb`); values.push(JSON.stringify(updates.tiers)); }
    if (updates.rewards !== undefined) { fields.push(`rewards = $${idx++}::jsonb`); values.push(JSON.stringify(updates.rewards)); }

    if (fields.length === 0) return this.getConfig(schemaName);

    fields.push('updated_at = NOW()');

    // Upsert: update if exists, insert if not
    const existing = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "${schemaName}".loyalty_config LIMIT 1`,
    );

    if (existing.length > 0) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "${schemaName}".loyalty_config SET ${fields.join(', ')} WHERE id = '${existing[0].id}'`,
        ...values,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".loyalty_config (is_enabled) VALUES (false)`,
      );
      const newRow = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM "${schemaName}".loyalty_config LIMIT 1`,
      );
      await this.prisma.$executeRawUnsafe(
        `UPDATE "${schemaName}".loyalty_config SET ${fields.join(', ')} WHERE id = '${newRow[0].id}'`,
        ...values,
      );
    }

    return this.getConfig(schemaName);
  }

  // ─── Points Operations ──────────────────────────────────────────

  async getCustomerBalance(customerId: string, schemaName: string): Promise<number> {
    await this.ensureTables(schemaName);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT COALESCE(SUM(points), 0) AS balance
      FROM "${schemaName}".loyalty_transactions
      WHERE customer_id = $1::uuid
    `, customerId);
    return parseInt(rows[0]?.balance ?? '0');
  }

  async getCustomerLoyalty(customerId: string, schemaName: string): Promise<CustomerLoyalty | null> {
    await this.ensureTables(schemaName);
    const config = await this.getConfig(schemaName);
    if (!config.isEnabled) return null;

    const balance = await this.getCustomerBalance(customerId, schemaName);

    // Get customer name
    const custRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT name FROM "${schemaName}".customers WHERE id = $1::uuid`, customerId,
    );
    const customerName = custRows[0]?.name ?? 'Cliente';

    // Totals
    const totals = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        COALESCE(SUM(points) FILTER (WHERE points > 0), 0) AS earned,
        COALESCE(ABS(SUM(points) FILTER (WHERE points < 0)), 0) AS redeemed
      FROM "${schemaName}".loyalty_transactions
      WHERE customer_id = $1::uuid
    `, customerId);

    // Determine tier
    const tiers = config.tiers.sort((a, b) => b.minPoints - a.minPoints);
    let currentTier = tiers[tiers.length - 1]?.name ?? 'Sin tier';
    let nextTier: string | null = null;
    let pointsToNextTier = 0;

    // Total earned determines tier (not current balance)
    const totalEarned = parseInt(totals[0]?.earned ?? '0');

    for (let i = 0; i < tiers.length; i++) {
      if (totalEarned >= tiers[i].minPoints) {
        currentTier = tiers[i].name;
        if (i > 0) {
          nextTier = tiers[i - 1].name;
          pointsToNextTier = tiers[i - 1].minPoints - totalEarned;
        }
        break;
      }
    }

    return {
      customerId,
      customerName,
      totalPoints: balance,
      currentTier,
      nextTier,
      pointsToNextTier: Math.max(0, pointsToNextTier),
      totalEarned,
      totalRedeemed: parseInt(totals[0]?.redeemed ?? '0'),
    };
  }

  async earnPoints(
    customerId: string,
    orderId: string,
    orderTotal: number,
    schemaName: string,
  ): Promise<{ earned: number; newBalance: number } | null> {
    const config = await this.getConfig(schemaName);
    if (!config.isEnabled) return null;

    // Calculate points based on order total and tier multiplier
    const loyalty = await this.getCustomerLoyalty(customerId, schemaName);
    const tierMultiplier = config.tiers
      .sort((a, b) => b.minPoints - a.minPoints)
      .find(t => (loyalty?.totalEarned ?? 0) >= t.minPoints)?.multiplier ?? 1;

    const basePoints = Math.floor(orderTotal * parseFloat(String(config.pointsPerCurrency)));
    const earnedPoints = Math.floor(basePoints * tierMultiplier);

    if (earnedPoints <= 0) return null;

    const currentBalance = await this.getCustomerBalance(customerId, schemaName);
    const newBalance = currentBalance + earnedPoints;

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".loyalty_transactions
        (customer_id, type, points, balance_after, description, order_id)
      VALUES ($1::uuid, 'earn', $2, $3, $4, $5::uuid)
    `,
      customerId,
      earnedPoints,
      newBalance,
      `+${earnedPoints} pts por pedido $${orderTotal.toFixed(2)}${tierMultiplier > 1 ? ` (x${tierMultiplier} tier bonus)` : ''}`,
      orderId,
    );

    return { earned: earnedPoints, newBalance };
  }

  async redeemPoints(
    customerId: string,
    points: number,
    description: string,
    schemaName: string,
    orderId?: string,
  ): Promise<{ redeemed: number; newBalance: number; discountValue: number } | null> {
    const config = await this.getConfig(schemaName);
    if (!config.isEnabled) return null;

    const currentBalance = await this.getCustomerBalance(customerId, schemaName);
    if (currentBalance < points) {
      return null; // Not enough points
    }

    const newBalance = currentBalance - points;
    const discountValue = points / parseFloat(String(config.redemptionRate));

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".loyalty_transactions
        (customer_id, type, points, balance_after, description, order_id)
      VALUES ($1::uuid, 'redeem', $2, $3, $4, $5)
    `,
      customerId,
      -points,
      newBalance,
      description,
      orderId ?? null,
    );

    return { redeemed: points, newBalance, discountValue };
  }

  async giveWelcomeBonus(customerId: string, schemaName: string): Promise<number> {
    const config = await this.getConfig(schemaName);
    if (!config.isEnabled || config.welcomeBonus <= 0) return 0;

    // Check if already received welcome bonus
    const existing = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id FROM "${schemaName}".loyalty_transactions
      WHERE customer_id = $1::uuid AND type = 'bonus' AND description LIKE '%bienvenida%'
      LIMIT 1
    `, customerId);

    if (existing.length > 0) return 0;

    const currentBalance = await this.getCustomerBalance(customerId, schemaName);
    const newBalance = currentBalance + config.welcomeBonus;

    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".loyalty_transactions
        (customer_id, type, points, balance_after, description)
      VALUES ($1::uuid, 'bonus', $2, $3, 'Puntos de bienvenida')
    `, customerId, config.welcomeBonus, newBalance);

    return config.welcomeBonus;
  }

  // ─── Leaderboard / Top Customers ──────────────────────────────

  async getTopCustomers(schemaName: string, limit = 20) {
    await this.ensureTables(schemaName);
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        c.id AS "customerId",
        c.name AS "customerName",
        c.phone,
        COALESCE(SUM(lt.points), 0) AS "totalPoints",
        COALESCE(SUM(lt.points) FILTER (WHERE lt.points > 0), 0) AS "totalEarned",
        COALESCE(ABS(SUM(lt.points) FILTER (WHERE lt.points < 0)), 0) AS "totalRedeemed",
        COUNT(DISTINCT lt.order_id) FILTER (WHERE lt.type = 'earn') AS "orderCount"
      FROM "${schemaName}".customers c
      JOIN "${schemaName}".loyalty_transactions lt ON lt.customer_id = c.id
      GROUP BY c.id, c.name, c.phone
      ORDER BY "totalPoints" DESC
      LIMIT $1
    `, limit);
  }

  // ─── AI Context Builder ─────────────────────────────────────────

  async buildLoyaltyContext(customerId: string | null, schemaName: string): Promise<string> {
    const config = await this.getConfig(schemaName);
    if (!config.isEnabled) return '';

    let ctx = '\n\nPROGRAMA DE LEALTAD:\n';
    ctx += `- El negocio tiene un programa de puntos activo.\n`;
    ctx += `- Se ganan ${config.pointsPerCurrency} punto(s) por cada $1 gastado.\n`;
    ctx += `- ${config.redemptionRate} puntos = $1 de descuento.\n`;

    if (config.tiers.length > 0) {
      ctx += `- Niveles: ${config.tiers.map(t => `${t.name} (${t.minPoints}+ pts, x${t.multiplier})`).join(', ')}\n`;
    }

    if (config.rewards.length > 0) {
      ctx += `- Recompensas canjeables:\n`;
      for (const r of config.rewards) {
        ctx += `  • ${r.name}: ${r.pointsCost} pts`;
        if (r.type === 'discount_fixed') ctx += ` → $${r.value} de descuento`;
        if (r.type === 'discount_percent') ctx += ` → ${r.value}% de descuento`;
        if (r.type === 'free_product') ctx += ` → ${r.productName ?? 'producto'} gratis`;
        if (r.type === 'free_shipping') ctx += ` → envío gratis`;
        ctx += '\n';
      }
    }

    if (customerId) {
      const loyalty = await this.getCustomerLoyalty(customerId, schemaName);
      if (loyalty) {
        ctx += `\nPUNTOS DEL CLIENTE ACTUAL:\n`;
        ctx += `- Balance: ${loyalty.totalPoints} puntos\n`;
        ctx += `- Nivel: ${loyalty.currentTier}\n`;
        if (loyalty.nextTier) {
          ctx += `- Siguiente nivel: ${loyalty.nextTier} (faltan ${loyalty.pointsToNextTier} pts)\n`;
        }
        ctx += `- Si pregunta por sus puntos, usa check_loyalty_points.\n`;
        ctx += `- Si quiere canjear puntos, usa redeem_loyalty_points.\n`;
      }
    }

    return ctx;
  }

  // ─── Re-Engagement / Retention ───────────────────────────────────

  async getReEngagementTargets(schemaName: string): Promise<any[]> {
    try {
      await this.ensureTables(schemaName);
      // Find customers who haven't ordered in 7+ days but have ordered before
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          c.id, c.name, c.channel_type AS "channelType", c.channel_id AS "channelId",
          MAX(o.created_at) AS "lastOrderAt",
          EXTRACT(DAY FROM NOW() - MAX(o.created_at)) AS "daysSinceLastOrder",
          COUNT(o.id) AS "orderCount"
        FROM "${schemaName}".customers c
        JOIN "${schemaName}".orders o ON o.customer_id = c.id
        WHERE o.status NOT IN ('cancelled')
        GROUP BY c.id, c.name, c.channel_type, c.channel_id
        HAVING MAX(o.created_at) < NOW() - INTERVAL '7 days'
          AND MAX(o.created_at) > NOW() - INTERVAL '60 days'
        ORDER BY "daysSinceLastOrder" ASC
        LIMIT 50
      `);

      return rows.map(r => ({
        ...r,
        daysSinceLastOrder: parseInt(r.daysSinceLastOrder ?? '0'),
        orderCount: parseInt(r.orderCount ?? '0'),
        action: 'send_message',
        segment: parseInt(r.daysSinceLastOrder ?? '0') > 30 ? 'at_risk' : 'inactive',
        templateName: 'customer_reengagement',
        message: `¡Hola${r.name ? ` ${r.name}` : ''}! Te extrañamos. ¿Qué se te antoja hoy? 😊`,
      }));
    } catch (err: any) {
      this.logger.warn(`getReEngagementTargets failed: ${err.message}`);
      return [];
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private parseConfig(row: any): LoyaltyConfig {
    return {
      id: row.id,
      isEnabled: row.isEnabled,
      pointsPerCurrency: parseFloat(row.pointsPerCurrency ?? '1'),
      redemptionRate: parseFloat(row.redemptionRate ?? '10'),
      welcomeBonus: parseInt(row.welcomeBonus ?? '0'),
      tiers: typeof row.tiers === 'string' ? JSON.parse(row.tiers) : (row.tiers ?? []),
      rewards: typeof row.rewards === 'string' ? JSON.parse(row.rewards) : (row.rewards ?? []),
    };
  }
}
