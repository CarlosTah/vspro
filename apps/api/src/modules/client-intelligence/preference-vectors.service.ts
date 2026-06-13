import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';

/**
 * Preference Vectors Service.
 * Builds and maintains vector representations of customer preferences
 * for semantic product recommendations and personalization.
 *
 * Uses pgvector embeddings derived from:
 * - Purchase history patterns
 * - Conversation-detected preferences (from CustomerMemoryService)
 * - Explicit preferences (sizes, colors, styles)
 */
@Injectable()
export class PreferenceVectorsService {
  private readonly logger = new Logger(PreferenceVectorsService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get('OPENAI_API_KEY');
    this.openai = key && !key.startsWith('sk-test') ? new OpenAI({ apiKey: key }) : null;
  }

  /**
   * Build a preference vector for a customer based on their profile + history.
   * Stores as embedding in customer_memories for semantic matching.
   */
  async buildPreferenceVector(customerId: string, schemaName: string): Promise<void> {
    // 1. Gather preference signals
    const profile = await this.getCustomerProfile(customerId, schemaName);
    const purchaseCategories = await this.getPurchaseCategories(customerId, schemaName);

    // 2. Build preference text for embedding
    const preferenceText = this.buildPreferenceText(profile, purchaseCategories);
    if (!preferenceText) return;

    // 3. Generate embedding
    const embedding = await this.generateEmbedding(preferenceText);
    if (!embedding) return;

    // 4. Store as episodic memory with category 'preference_detected'
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".customer_memory_episodes
        (customer_id, content, category, embedding)
      VALUES ($1::uuid, $2, 'preference_detected', $3::vector)
    `, customerId, `Perfil de preferencias: ${preferenceText}`, `[${embedding.join(',')}]`);

    this.logger.debug(`Preference vector built for customer ${customerId}`);
  }

  /**
   * Find products similar to a customer's preferences.
   * Uses cosine similarity between preference vector and product embeddings.
   */
  async recommendProducts(
    customerId: string,
    schemaName: string,
    limit = 5,
  ): Promise<ProductRecommendation[]> {
    // Get customer's latest preference embedding
    const prefEmbeddings = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT embedding FROM "${schemaName}".customer_memory_episodes
      WHERE customer_id = $1::uuid AND category = 'preference_detected'
        AND embedding IS NOT NULL
      ORDER BY created_at DESC LIMIT 1
    `, customerId);

    if (!prefEmbeddings[0]?.embedding) return [];

    // Find similar products
    const products = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.name, p.price, p.category, p.images,
             1 - (p.embedding <=> $1::vector) AS similarity
      FROM "${schemaName}".products p
      WHERE p.is_active = true AND p.embedding IS NOT NULL
      ORDER BY p.embedding <=> $1::vector
      LIMIT $2
    `, prefEmbeddings[0].embedding, limit);

    return products.map(p => ({
      productId: p.id,
      name: p.name,
      price: parseFloat(p.price),
      category: p.category,
      similarity: parseFloat(p.similarity),
      image: p.images?.[0] ?? null,
    }));
  }

  /**
   * Get preference insights for a customer (dashboard).
   */
  async getPreferenceInsights(customerId: string, schemaName: string): Promise<PreferenceInsights> {
    const profile = await this.getCustomerProfile(customerId, schemaName);
    const categories = await this.getPurchaseCategories(customerId, schemaName);
    const topProducts = await this.getTopPurchasedProducts(customerId, schemaName);

    return {
      preferences: profile?.preferences ?? {},
      sizes: profile?.sizes ?? {},
      favoriteCategories: categories,
      topProducts,
      totalOrders: await this.getOrderCount(customerId, schemaName),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async getCustomerProfile(customerId: string, schema: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT profile FROM "${schema}".customer_memories WHERE customer_id = $1::uuid`,
      customerId,
    );
    return rows[0]?.profile ?? null;
  }

  private async getPurchaseCategories(customerId: string, schema: string): Promise<string[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT p.category
      FROM "${schema}".orders o,
           jsonb_array_elements(o.items) AS item
      JOIN "${schema}".products p ON p.id = (item->>'productId')::uuid
      WHERE o.customer_id = $1::uuid AND o.status != 'cancelled'
    `, customerId);
    return rows.map(r => r.category).filter(Boolean);
  }

  private async getTopPurchasedProducts(customerId: string, schema: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.name, SUM((item->>'quantity')::int) AS qty
      FROM "${schema}".orders o,
           jsonb_array_elements(o.items) AS item
      JOIN "${schema}".products p ON p.id = (item->>'productId')::uuid
      WHERE o.customer_id = $1::uuid AND o.status != 'cancelled'
      GROUP BY p.name ORDER BY qty DESC LIMIT 5
    `, customerId);
    return rows.map(r => ({ name: r.name, quantity: parseInt(r.qty) }));
  }

  private async getOrderCount(customerId: string, schema: string): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS c FROM "${schema}".orders WHERE customer_id = $1::uuid AND status != 'cancelled'`,
      customerId,
    );
    return parseInt(rows[0]?.c ?? '0');
  }

  private buildPreferenceText(profile: any, categories: string[]): string {
    const parts: string[] = [];
    if (profile?.preferences) parts.push(`Preferencias: ${JSON.stringify(profile.preferences)}`);
    if (profile?.sizes) parts.push(`Tallas: ${JSON.stringify(profile.sizes)}`);
    if (categories.length > 0) parts.push(`Categorías favoritas: ${categories.join(', ')}`);
    return parts.join('. ');
  }

  private async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.openai) return null;
    try {
      const res = await this.openai.embeddings.create({ model: 'text-embedding-3-small', input: text });
      return res.data[0].embedding;
    } catch { return null; }
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface ProductRecommendation {
  productId: string;
  name: string;
  price: number;
  category: string;
  similarity: number;
  image: string | null;
}

export interface PreferenceInsights {
  preferences: Record<string, any>;
  sizes: Record<string, string>;
  favoriteCategories: string[];
  topProducts: Array<{ name: string; quantity: number }>;
  totalOrders: number;
}
