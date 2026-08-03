import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get('OPENAI_API_KEY'),
    });
  }

  // ─── Generate Embedding ───────────────────────────────────────

  /**
   * Generate an embedding vector for a given text using text-embedding-3-small.
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000), // Max input length safety
        dimensions: 1536,
      });
      return response.data[0].embedding;
    } catch (err: any) {
      this.logger.warn(`Embedding generation failed: ${err.message}`);
      return null;
    }
  }

  // ─── Semantic Search: Products ────────────────────────────────

  /**
   * Search products by semantic similarity. Returns top N matches.
   */
  async searchProducts(query: string, schemaName: string, limit: number = 5): Promise<any[]> {
    const embedding = await this.generateEmbedding(query);
    if (!embedding) {
      // Fallback to fuzzy text search
      return this.fallbackProductSearch(query, schemaName, limit);
    }

    const vectorStr = `[${embedding.join(',')}]`;

    try {
      const results = await this.prisma.$queryRawUnsafe<any[]>(
        `
        SELECT id, name, price, category, description,
               stock_available AS "stockAvailable",
               1 - (embedding <=> $1::vector) AS similarity
        FROM "${schemaName}".products
        WHERE is_active = true AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `,
        vectorStr,
        limit,
      );

      // If no results with embeddings, fallback to text search
      if (results.length === 0) {
        return this.fallbackProductSearch(query, schemaName, limit);
      }

      // Filter out very low similarity (< 0.3 threshold)
      const filtered = results.filter((r: any) => r.similarity > 0.3);
      return filtered.length > 0 ? filtered : this.fallbackProductSearch(query, schemaName, limit);
    } catch (err: any) {
      this.logger.warn(`Vector search failed, falling back to text: ${err.message}`);
      return this.fallbackProductSearch(query, schemaName, limit);
    }
  }

  private async fallbackProductSearch(
    query: string,
    schemaName: string,
    limit: number,
  ): Promise<any[]> {
    return this.prisma.$queryRawUnsafe<any[]>(
      `
      SELECT id, name, price, category, description,
             stock_available AS "stockAvailable"
      FROM "${schemaName}".products
      WHERE is_active = true
        AND (LOWER(name) LIKE $1 OR LOWER(category) LIKE $1 OR LOWER(description) LIKE $1)
      ORDER BY name
      LIMIT $2
    `,
      `%${query.toLowerCase()}%`,
      limit,
    );
  }

  // ─── Semantic Search: Knowledge Base ──────────────────────────

  /**
   * Search knowledge base by semantic similarity.
   */
  async searchKnowledgeBase(query: string, schemaName: string, limit: number = 3): Promise<any[]> {
    // Ensure embedding column exists
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".knowledge_base ADD COLUMN IF NOT EXISTS embedding vector(1536)`,
    );

    const embedding = await this.generateEmbedding(query);
    if (!embedding) {
      return this.fallbackKbSearch(query, schemaName, limit);
    }

    const vectorStr = `[${embedding.join(',')}]`;

    try {
      const results = await this.prisma.$queryRawUnsafe<any[]>(
        `
        SELECT id, title, content, category,
               1 - (embedding <=> $1::vector) AS similarity
        FROM "${schemaName}".knowledge_base
        WHERE is_active = true AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `,
        vectorStr,
        limit,
      );

      if (results.length === 0) {
        return this.fallbackKbSearch(query, schemaName, limit);
      }

      const filtered = results.filter((r: any) => r.similarity > 0.25);
      return filtered.length > 0 ? filtered : this.fallbackKbSearch(query, schemaName, limit);
    } catch {
      return this.fallbackKbSearch(query, schemaName, limit);
    }
  }

  private async fallbackKbSearch(query: string, schemaName: string, limit: number): Promise<any[]> {
    return this.prisma.$queryRawUnsafe<any[]>(
      `
      SELECT id, title, content, category
      FROM "${schemaName}".knowledge_base
      WHERE is_active = true
        AND (LOWER(title) LIKE $1 OR LOWER(content) LIKE $1)
      ORDER BY sort_order
      LIMIT $2
    `,
      `%${query.toLowerCase()}%`,
      limit,
    );
  }

  // ─── Embedding Generation for Records ─────────────────────────

  /**
   * Generate and store embedding for a product.
   */
  async embedProduct(productId: string, schemaName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT name, description, category, price FROM "${schemaName}".products WHERE id = $1::uuid`,
      productId,
    );
    const product = rows[0];
    if (!product) return false;

    const text = [
      product.name,
      product.category ? `Categoría: ${product.category}` : '',
      product.description || '',
      `Precio: $${product.price}`,
    ]
      .filter(Boolean)
      .join('. ');

    const embedding = await this.generateEmbedding(text);
    if (!embedding) return false;

    const vectorStr = `[${embedding.join(',')}]`;
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".products SET embedding = $1::vector WHERE id = $2::uuid`,
      vectorStr,
      productId,
    );
    return true;
  }

  /**
   * Generate and store embedding for a KB entry.
   */
  async embedKbEntry(entryId: string, schemaName: string): Promise<boolean> {
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".knowledge_base ADD COLUMN IF NOT EXISTS embedding vector(1536)`,
    );

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT title, content, category FROM "${schemaName}".knowledge_base WHERE id = $1::uuid`,
      entryId,
    );
    const entry = rows[0];
    if (!entry) return false;

    const text = `${entry.title}. ${entry.content}`;
    const embedding = await this.generateEmbedding(text);
    if (!embedding) return false;

    const vectorStr = `[${embedding.join(',')}]`;
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".knowledge_base SET embedding = $1::vector WHERE id = $2::uuid`,
      vectorStr,
      entryId,
    );
    return true;
  }

  /**
   * Bulk embed all products that don't have embeddings yet.
   */
  async embedAllProducts(schemaName: string): Promise<number> {
    const products = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "${schemaName}".products WHERE is_active = true AND embedding IS NULL`,
    );

    let count = 0;
    for (const p of products) {
      const success = await this.embedProduct(p.id, schemaName);
      if (success) count++;
      // Rate limiting: small delay between calls
      if (count % 10 === 0) await new Promise((r) => setTimeout(r, 500));
    }

    this.logger.log(`[${schemaName}] Embedded ${count}/${products.length} products`);
    return count;
  }

  /**
   * Bulk embed all KB entries that don't have embeddings yet.
   */
  async embedAllKbEntries(schemaName: string): Promise<number> {
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".knowledge_base ADD COLUMN IF NOT EXISTS embedding vector(1536)`,
    );

    const entries = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "${schemaName}".knowledge_base WHERE is_active = true AND embedding IS NULL`,
    );

    let count = 0;
    for (const e of entries) {
      const success = await this.embedKbEntry(e.id, schemaName);
      if (success) count++;
      if (count % 10 === 0) await new Promise((r) => setTimeout(r, 500));
    }

    this.logger.log(`[${schemaName}] Embedded ${count}/${entries.length} KB entries`);
    return count;
  }
}
