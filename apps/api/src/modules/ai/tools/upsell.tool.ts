import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Upsell/Cross-sell Tool — Intelligent product recommendations.
 *
 * Strategies:
 * 1. Same-category upsell: Higher-priced product in same category
 * 2. Cross-sell by complement: Products that pair well (same purchases by other customers)
 * 3. Frequently bought together: Items commonly ordered in the same cart
 * 4. Customer preference match: Based on memory profile (sizes, colors, style)
 *
 * The AI calls suggest_upsell after a product is added to cart or when
 * showing product details.
 */
@Injectable()
export class UpsellTool {
  private readonly logger = new Logger(UpsellTool.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get upsell/cross-sell recommendations based on current context.
   */
  async suggest(
    args: {
      productId?: string;
      productName?: string;
      category?: string;
      cartProductIds?: string[];
      customerId?: string;
      strategy?: 'upsell' | 'cross_sell' | 'complement' | 'auto';
    },
    schemaName: string,
  ): Promise<UpsellResponse> {
    const strategy = args.strategy ?? 'auto';
    const recommendations: Recommendation[] = [];

    // Strategy 1: Same category, higher price (upsell)
    if (strategy === 'upsell' || strategy === 'auto') {
      const upsells = await this.getUpgradeOptions(args, schemaName);
      recommendations.push(...upsells);
    }

    // Strategy 2: Complementary products (cross-sell)
    if (strategy === 'cross_sell' || strategy === 'auto') {
      const crossSells = await this.getComplementaryProducts(args, schemaName);
      recommendations.push(...crossSells);
    }

    // Strategy 3: Frequently bought together
    if (strategy === 'complement' || strategy === 'auto') {
      const fbt = await this.getFrequentlyBoughtTogether(args, schemaName);
      recommendations.push(...fbt);
    }

    // Strategy 4: Preference-based (if customer identified)
    if (args.customerId && strategy === 'auto') {
      const prefBased = await this.getPreferenceBasedSuggestions(args.customerId, args.cartProductIds ?? [], schemaName);
      recommendations.push(...prefBased);
    }

    // Deduplicate and limit
    const unique = this.deduplicateAndRank(recommendations, args.cartProductIds ?? []);
    const topPicks = unique.slice(0, 3);

    return {
      recommendations: topPicks,
      hasRecommendations: topPicks.length > 0,
      formatted: this.formatForChat(topPicks),
    };
  }

  // ─── Strategy Implementations ─────────────────────────────────

  /**
   * Strategy 1: Upsell — same category, higher value.
   * "Ya que te gusta el Vestido Floral ($389), el Vestido Tutú ($549) es más elegante"
   */
  private async getUpgradeOptions(args: any, schema: string): Promise<Recommendation[]> {
    if (!args.productId && !args.category) return [];

    let basePrice = 0;
    let category = args.category;

    if (args.productId) {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT price, category FROM "${schema}".products WHERE id = $1::uuid`, args.productId,
      );
      if (rows[0]) { basePrice = parseFloat(rows[0].price); category = rows[0].category; }
    }

    if (!category) return [];

    const upgrades = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.name, p.price, p.images, p.description, i.stock_available
      FROM "${schema}".products p
      LEFT JOIN "${schema}".inventory i ON i.product_id = p.id
      WHERE p.is_active = true AND p.category = $1
        AND p.price > $2 AND (i.stock_available > 0 OR i.stock_available IS NULL)
        ${args.productId ? `AND p.id != '${args.productId}'::uuid` : ''}
      ORDER BY p.price ASC
      LIMIT 2
    `, category, basePrice);

    return upgrades.map((p: any) => ({
      productId: p.id,
      name: p.name,
      price: parseFloat(p.price),
      imageUrl: p.images?.[0] ?? null,
      reason: `upgrade_same_category`,
      label: `✨ Versión premium en ${category}`,
      description: p.description?.slice(0, 60) ?? '',
    }));
  }

  /**
   * Strategy 2: Cross-sell — different category that complements.
   * Uses simple category pairing rules.
   */
  private async getComplementaryProducts(args: any, schema: string): Promise<Recommendation[]> {
    const category = args.category;
    if (!category) return [];

    // Category complement map (configurable per tenant in future)
    const complements: Record<string, string[]> = {
      'Vestidos': ['Accesorios', 'Calzado', 'Chamarras'],
      'Conjuntos': ['Accesorios', 'Calzado'],
      'Pantalones': ['Playeras', 'Chamarras', 'Calzado'],
      'Playeras': ['Pantalones', 'Faldas'],
      'Chamarras': ['Vestidos', 'Conjuntos'],
      'Faldas': ['Playeras', 'Chamarras'],
      'Calzado': ['Accesorios'],
      'Accesorios': ['Vestidos', 'Conjuntos'],
    };

    const complementCategories = complements[category] ?? [];
    if (complementCategories.length === 0) return [];

    const products = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.name, p.price, p.category, p.images, i.stock_available
      FROM "${schema}".products p
      LEFT JOIN "${schema}".inventory i ON i.product_id = p.id
      WHERE p.is_active = true AND p.category = ANY($1::text[])
        AND (i.stock_available > 0 OR i.stock_available IS NULL)
      ORDER BY RANDOM()
      LIMIT 2
    `, complementCategories);

    return products.map((p: any) => ({
      productId: p.id,
      name: p.name,
      price: parseFloat(p.price),
      imageUrl: p.images?.[0] ?? null,
      reason: 'complement',
      label: `🎯 Combina perfecto`,
      description: `Va genial con ${category.toLowerCase()}`,
    }));
  }

  /**
   * Strategy 3: Frequently bought together — based on order history.
   */
  private async getFrequentlyBoughtTogether(args: any, schema: string): Promise<Recommendation[]> {
    if (!args.productId) return [];

    // Find products that appear in the same orders as the target product
    const coProducts = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.name, p.price, p.images, COUNT(*) AS co_count
      FROM "${schema}".orders o,
           jsonb_array_elements(o.items) AS item
      JOIN "${schema}".products p ON p.id = (item->>'productId')::uuid
      WHERE o.id IN (
        SELECT o2.id FROM "${schema}".orders o2,
               jsonb_array_elements(o2.items) AS item2
        WHERE (item2->>'productId')::uuid = $1::uuid
      )
      AND p.id != $1::uuid AND p.is_active = true
      GROUP BY p.id, p.name, p.price, p.images
      ORDER BY co_count DESC
      LIMIT 2
    `, args.productId).catch(() => []);

    return coProducts.map((p: any) => ({
      productId: p.id,
      name: p.name,
      price: parseFloat(p.price),
      imageUrl: p.images?.[0] ?? null,
      reason: 'frequently_bought_together',
      label: `🛒 Otros clientes también compraron`,
      description: '',
    }));
  }

  /**
   * Strategy 4: Preference-based — uses customer memory profile.
   */
  private async getPreferenceBasedSuggestions(
    customerId: string,
    excludeIds: string[],
    schema: string,
  ): Promise<Recommendation[]> {
    // Get customer preferences
    const memRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT profile FROM "${schema}".customer_memories WHERE customer_id = $1::uuid`,
      customerId,
    );

    const profile = memRows[0]?.profile;
    if (!profile?.preferences) return [];

    // Build search from preferences
    const prefs = profile.preferences;
    const searchTerms: string[] = [];
    if (prefs.color) searchTerms.push(prefs.color);
    if (prefs.estilo) searchTerms.push(prefs.estilo);
    if (prefs.category) searchTerms.push(prefs.category);

    if (searchTerms.length === 0) return [];

    const searchPattern = searchTerms.join('|');
    const excludeClause = excludeIds.length > 0
      ? `AND p.id NOT IN (${excludeIds.map(id => `'${id}'::uuid`).join(',')})`
      : '';

    const products = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.name, p.price, p.images
      FROM "${schema}".products p
      LEFT JOIN "${schema}".inventory i ON i.product_id = p.id
      WHERE p.is_active = true
        AND (p.name ~* $1 OR p.description ~* $1 OR p.category ~* $1)
        AND (i.stock_available > 0 OR i.stock_available IS NULL)
        ${excludeClause}
      LIMIT 2
    `, searchPattern);

    return products.map((p: any) => ({
      productId: p.id,
      name: p.name,
      price: parseFloat(p.price),
      imageUrl: p.images?.[0] ?? null,
      reason: 'preference_match',
      label: `💜 Basado en tus gustos`,
      description: `Te puede gustar por tu preferencia en ${searchTerms.join(', ')}`,
    }));
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private deduplicateAndRank(recs: Recommendation[], excludeIds: string[]): Recommendation[] {
    const seen = new Set<string>(excludeIds);
    const unique: Recommendation[] = [];

    // Priority order: preference > frequently_bought > complement > upgrade
    const priorityOrder = ['preference_match', 'frequently_bought_together', 'complement', 'upgrade_same_category'];

    const sorted = [...recs].sort((a, b) => {
      return priorityOrder.indexOf(a.reason) - priorityOrder.indexOf(b.reason);
    });

    for (const rec of sorted) {
      if (!seen.has(rec.productId)) {
        seen.add(rec.productId);
        unique.push(rec);
      }
    }

    return unique;
  }

  private formatForChat(recs: Recommendation[]): string {
    if (recs.length === 0) return '';

    let msg = `\n💡 *También te puede interesar:*\n\n`;
    for (const rec of recs) {
      msg += `${rec.label}\n`;
      msg += `  • *${rec.name}* — $${rec.price.toLocaleString()}`;
      if (rec.description) msg += ` (${rec.description})`;
      msg += `\n\n`;
    }
    msg += `¿Te agrego alguno?`;
    return msg;
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface Recommendation {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  reason: string;
  label: string;
  description: string;
}

export interface UpsellResponse {
  recommendations: Recommendation[];
  hasRecommendations: boolean;
  formatted: string;
}
