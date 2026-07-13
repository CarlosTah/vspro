import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';

export interface KnowledgeBaseEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKbEntryDto {
  title: string;
  content: string;
  category?: string;
  sortOrder?: number;
}

export interface UpdateKbEntryDto {
  title?: string;
  content?: string;
  category?: string;
  isActive?: boolean;
  sortOrder?: number;
}

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get('OPENAI_API_KEY');
    this.openai = key && key !== 'sk-...' ? new OpenAI({ apiKey: key }) : null;
  }

  // ─── Ensure embedding column exists ─────────────────────────

  private async ensureEmbeddingColumn(schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE "${schemaName}".knowledge_base
      ADD COLUMN IF NOT EXISTS embedding vector(1536)
    `).catch(() => {});
  }

  // ─── Embedding generation ───────────────────────────────────

  private async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.openai) return null;
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    } catch (err: any) {
      this.logger.error(`Embedding generation failed: ${err.message}`);
      return null;
    }
  }

  // ─── Semantic Search (RAG) ──────────────────────────────────

  /**
   * Search knowledge base using semantic similarity.
   * Returns top-K entries most relevant to the query.
   */
  async semanticSearch(query: string, schemaName: string, limit = 3, minSimilarity = 0.3): Promise<KnowledgeBaseEntry[]> {
    await this.ensureEmbeddingColumn(schemaName);

    const embedding = await this.generateEmbedding(query);
    if (!embedding) {
      // Fallback: keyword search
      return this.keywordSearch(query, schemaName, limit);
    }

    const vectorStr = `[${embedding.join(',')}]`;

    const results = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, title, content, category,
             is_active AS "isActive",
             sort_order AS "sortOrder",
             1 - (embedding <=> $1::vector) AS similarity
      FROM "${schemaName}".knowledge_base
      WHERE is_active = true
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) > ${minSimilarity}
      ORDER BY embedding <=> $1::vector
      LIMIT ${limit}
    `, vectorStr);

    // If no results with embeddings, try keyword fallback
    if (results.length === 0) {
      return this.keywordSearch(query, schemaName, limit);
    }

    return results;
  }

  /**
   * Fallback keyword search when embeddings aren't available.
   */
  private async keywordSearch(query: string, schemaName: string, limit: number): Promise<KnowledgeBaseEntry[]> {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 5);
    if (words.length === 0) return this.findAll(schemaName, true);

    const conditions = words.map((_, i) => `(LOWER(title) LIKE $${i + 1} OR LOWER(content) LIKE $${i + 1})`);
    const values = words.map(w => `%${w}%`);

    const results = await this.prisma.$queryRawUnsafe<KnowledgeBaseEntry[]>(`
      SELECT id, title, content, category,
             is_active AS "isActive",
             sort_order AS "sortOrder"
      FROM "${schemaName}".knowledge_base
      WHERE is_active = true AND (${conditions.join(' OR ')})
      ORDER BY sort_order ASC
      LIMIT ${limit}
    `, ...values);

    return results;
  }

  /**
   * Build RAG context for the AI: searches for relevant knowledge and formats it.
   * Used by the state machine orchestrator.
   */
  async buildRAGContext(query: string, schemaName: string): Promise<string> {
    const results = await this.semanticSearch(query, schemaName, 3);
    if (results.length === 0) return '';

    const sections = results.map(e => `[${e.title}]: ${e.content}`);
    return `\n\nINFORMACIÓN VERIFICADA DEL NEGOCIO:\n${sections.join('\n')}`;
  }

  // ─── CRUD ───────────────────────────────────────────────────

  async findAll(schemaName: string, activeOnly = false): Promise<KnowledgeBaseEntry[]> {
    const filter = activeOnly ? 'WHERE is_active = true' : '';
    return this.prisma.$queryRawUnsafe<KnowledgeBaseEntry[]>(`
      SELECT id, title, content, category,
             is_active AS "isActive",
             sort_order AS "sortOrder",
             created_at AS "createdAt",
             updated_at AS "updatedAt"
      FROM "${schemaName}".knowledge_base
      ${filter}
      ORDER BY sort_order ASC, created_at ASC
    `);
  }

  async findById(id: string, schemaName: string): Promise<KnowledgeBaseEntry> {
    const rows = await this.prisma.$queryRawUnsafe<KnowledgeBaseEntry[]>(`
      SELECT id, title, content, category,
             is_active AS "isActive",
             sort_order AS "sortOrder",
             created_at AS "createdAt",
             updated_at AS "updatedAt"
      FROM "${schemaName}".knowledge_base
      WHERE id = $1::uuid
    `, id);

    if (!rows[0]) throw new NotFoundException('Entrada no encontrada');
    return rows[0];
  }

  async create(dto: CreateKbEntryDto, schemaName: string): Promise<KnowledgeBaseEntry> {
    await this.ensureEmbeddingColumn(schemaName);

    // Generate embedding from title + content
    const embeddingText = `${dto.title}: ${dto.content}`;
    const embedding = await this.generateEmbedding(embeddingText);

    let rows: KnowledgeBaseEntry[];
    if (embedding) {
      const vectorStr = `[${embedding.join(',')}]`;
      rows = await this.prisma.$queryRawUnsafe<KnowledgeBaseEntry[]>(`
        INSERT INTO "${schemaName}".knowledge_base (title, content, category, sort_order, embedding)
        VALUES ($1, $2, $3, $4, $5::vector)
        RETURNING id, title, content, category,
                  is_active AS "isActive",
                  sort_order AS "sortOrder",
                  created_at AS "createdAt",
                  updated_at AS "updatedAt"
      `, dto.title, dto.content, dto.category ?? 'general', dto.sortOrder ?? 0, vectorStr);
    } else {
      rows = await this.prisma.$queryRawUnsafe<KnowledgeBaseEntry[]>(`
        INSERT INTO "${schemaName}".knowledge_base (title, content, category, sort_order)
        VALUES ($1, $2, $3, $4)
        RETURNING id, title, content, category,
                  is_active AS "isActive",
                  sort_order AS "sortOrder",
                  created_at AS "createdAt",
                  updated_at AS "updatedAt"
      `, dto.title, dto.content, dto.category ?? 'general', dto.sortOrder ?? 0);
    }

    this.logger.log(`KB entry created: "${dto.title}" in ${schemaName} (embedding: ${!!embedding})`);
    return rows[0];
  }

  async update(id: string, dto: UpdateKbEntryDto, schemaName: string): Promise<KnowledgeBaseEntry> {
    await this.ensureEmbeddingColumn(schemaName);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.title !== undefined) { fields.push(`title = $${idx++}`); values.push(dto.title); }
    if (dto.content !== undefined) { fields.push(`content = $${idx++}`); values.push(dto.content); }
    if (dto.category !== undefined) { fields.push(`category = $${idx++}`); values.push(dto.category); }
    if (dto.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(dto.isActive); }
    if (dto.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(dto.sortOrder); }

    if (fields.length === 0) return this.findById(id, schemaName);

    // Re-generate embedding if title or content changed
    if (dto.title !== undefined || dto.content !== undefined) {
      const current = await this.findById(id, schemaName);
      const newTitle = dto.title ?? current.title;
      const newContent = dto.content ?? current.content;
      const embedding = await this.generateEmbedding(`${newTitle}: ${newContent}`);
      if (embedding) {
        fields.push(`embedding = $${idx++}::vector`);
        values.push(`[${embedding.join(',')}]`);
      }
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".knowledge_base SET ${fields.join(', ')} WHERE id = $${idx}::uuid`,
      ...values,
    );

    return this.findById(id, schemaName);
  }

  async delete(id: string, schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "${schemaName}".knowledge_base WHERE id = $1::uuid`,
      id,
    );
  }

  /**
   * Regenerate embeddings for all entries that don't have one.
   * Useful after initial migration.
   */
  async regenerateEmbeddings(schemaName: string): Promise<number> {
    await this.ensureEmbeddingColumn(schemaName);

    const entries = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, title, content FROM "${schemaName}".knowledge_base
      WHERE embedding IS NULL AND is_active = true
    `);

    let count = 0;
    for (const entry of entries) {
      const embedding = await this.generateEmbedding(`${entry.title}: ${entry.content}`);
      if (embedding) {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "${schemaName}".knowledge_base SET embedding = $1::vector WHERE id = $2::uuid`,
          `[${embedding.join(',')}]`, entry.id,
        );
        count++;
      }
    }

    this.logger.log(`Regenerated ${count} embeddings for ${schemaName}`);
    return count;
  }

  /**
   * Legacy method: Builds full knowledge context (all active entries).
   * Used by the old GPT-4o owner path.
   */
  async buildKnowledgeContext(schemaName: string): Promise<string> {
    const entries = await this.findAll(schemaName, true);
    if (entries.length === 0) return '';

    const sections = entries.map(e => `### ${e.title}\n${e.content}`);
    return `\n\n## BASE DE CONOCIMIENTO\n${sections.join('\n\n')}`;
  }
}
