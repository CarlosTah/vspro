import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import {
  CustomerProfile,
  EpisodeCategory,
  EpisodeResult,
  MigrationResult,
  UpdateCustomerMemoryArgs,
  VALID_PROFILE_KEYS,
  VALID_EPISODE_CATEGORIES,
  CustomerMemoryResponse,
} from './dto/customer-memory.dto';

/**
 * Hybrid long-term memory service for customers.
 * Combines JSONB deterministic profiles with pgvector episodic memory.
 * Operates within tenant-isolated schemas.
 */
@Injectable()
export class CustomerMemoryService {
  private readonly logger = new Logger(CustomerMemoryService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get('OPENAI_API_KEY');
    this.openai = key && !key.startsWith('sk-test') && key !== 'sk-...'
      ? new OpenAI({ apiKey: key })
      : null;
  }

  // ─── Profile Operations ───────────────────────────────────────

  async upsertProfile(
    customerId: string,
    category: string,
    data: Record<string, any>,
    schemaName: string,
  ): Promise<void> {
    if (!VALID_PROFILE_KEYS.includes(category as any)) {
      throw new BadRequestException(
        `Invalid profile category '${category}'. Valid: ${VALID_PROFILE_KEYS.join(', ')}`,
      );
    }

    await this.ensureCustomerExists(customerId, schemaName);

    // Upsert with deep-merge: insert if not exists, merge into existing key
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".customer_memories (customer_id, profile)
      VALUES ($1::uuid, jsonb_build_object($2::text, $3::jsonb))
      ON CONFLICT (customer_id)
      DO UPDATE SET
        profile = jsonb_set(
          customer_memories.profile,
          ARRAY[$2::text],
          COALESCE(customer_memories.profile->$2::text, '{}'::jsonb) || $3::jsonb
        ),
        updated_at = NOW()
    `, customerId, category, JSON.stringify(data));
  }

  async getProfile(customerId: string, schemaName: string): Promise<CustomerProfile | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT profile FROM "${schemaName}".customer_memories
      WHERE customer_id = $1::uuid
    `, customerId);

    return rows[0]?.profile ?? null;
  }

  // ─── Episode Operations ───────────────────────────────────────

  async createEpisode(
    customerId: string,
    content: string,
    category: EpisodeCategory,
    schemaName: string,
  ): Promise<{ id: string }> {
    if (!VALID_EPISODE_CATEGORIES.includes(category)) {
      throw new BadRequestException(
        `Invalid episode category '${category}'. Valid: ${VALID_EPISODE_CATEGORIES.join(', ')}`,
      );
    }

    await this.ensureCustomerExists(customerId, schemaName);

    const embedding = await this.generateEmbedding(content);

    let rows: any[];
    if (embedding) {
      rows = await this.prisma.$queryRawUnsafe<any[]>(`
        INSERT INTO "${schemaName}".customer_memory_episodes
          (customer_id, content, category, embedding)
        VALUES ($1::uuid, $2, $3, $4::vector)
        RETURNING id
      `, customerId, content, category, `[${embedding.join(',')}]`);
    } else {
      this.logger.warn(`Embedding unavailable for episode, storing with NULL embedding`);
      rows = await this.prisma.$queryRawUnsafe<any[]>(`
        INSERT INTO "${schemaName}".customer_memory_episodes
          (customer_id, content, category)
        VALUES ($1::uuid, $2, $3)
        RETURNING id
      `, customerId, content, category);
    }

    return { id: rows[0].id };
  }

  async searchEpisodes(
    customerId: string,
    queryEmbedding: number[],
    schemaName: string,
    limit = 5,
  ): Promise<EpisodeResult[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, content, category,
             1 - (embedding <=> $1::vector) AS similarity,
             created_at AS "createdAt"
      FROM "${schemaName}".customer_memory_episodes
      WHERE customer_id = $2::uuid
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, `[${queryEmbedding.join(',')}]`, customerId, limit);

    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      category: r.category,
      similarity: parseFloat(r.similarity),
      createdAt: r.createdAt,
    }));
  }

  async getRecentEpisodes(
    customerId: string,
    schemaName: string,
    limit = 20,
  ): Promise<EpisodeResult[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, content, category, created_at AS "createdAt"
      FROM "${schemaName}".customer_memory_episodes
      WHERE customer_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT $2
    `, customerId, limit);

    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      category: r.category,
      createdAt: r.createdAt,
    }));
  }

  async deleteEpisode(episodeId: string, customerId: string, schemaName: string): Promise<void> {
    const result = await this.prisma.$executeRawUnsafe(`
      DELETE FROM "${schemaName}".customer_memory_episodes
      WHERE id = $1::uuid AND customer_id = $2::uuid
    `, episodeId, customerId);

    if (result === 0) {
      throw new NotFoundException('Episode not found or does not belong to this customer');
    }
  }

  async deleteAllMemory(customerId: string, schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      DELETE FROM "${schemaName}".customer_memory_episodes WHERE customer_id = $1::uuid
    `, customerId);
    await this.prisma.$executeRawUnsafe(`
      DELETE FROM "${schemaName}".customer_memories WHERE customer_id = $1::uuid
    `, customerId);
  }

  // ─── Hybrid Retrieval ─────────────────────────────────────────

  async buildMemoryContext(
    customerId: string,
    currentMessage: string,
    schemaName: string,
  ): Promise<string> {
    if (!customerId) return '';

    const [profile, episodes] = await Promise.all([
      this.getProfile(customerId, schemaName).catch(() => null),
      this.getRelevantEpisodes(customerId, currentMessage, schemaName).catch(() => []),
    ]);

    if (!profile && episodes.length === 0) return '';

    const parts: string[] = ['\nMEMORIA DEL CLIENTE:'];

    if (profile && Object.keys(profile).length > 0) {
      parts.push('── Perfil ──');
      for (const [key, value] of Object.entries(profile)) {
        if (value && Object.keys(value).length > 0) {
          parts.push(`  ${key}: ${JSON.stringify(value)}`);
        }
      }
    }

    if (episodes.length > 0) {
      parts.push('── Recuerdos relevantes ──');
      for (const ep of episodes) {
        parts.push(`  [${ep.category}] ${ep.content}`);
      }
    }

    return parts.join('\n') + '\n';
  }

  private async getRelevantEpisodes(
    customerId: string,
    currentMessage: string,
    schemaName: string,
  ): Promise<EpisodeResult[]> {
    const embedding = await this.generateEmbedding(currentMessage);

    if (embedding) {
      return this.searchEpisodes(customerId, embedding, schemaName, 5);
    }

    // Fallback: most recent episodes when embedding unavailable
    return this.getRecentEpisodes(customerId, schemaName, 5);
  }

  // ─── Embedding ────────────────────────────────────────────────

  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.openai) return null;

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    } catch (err) {
      this.logger.error('Error generating embedding:', err);
      return null;
    }
  }

  // ─── Tool Handler ─────────────────────────────────────────────

  async handleToolCall(
    customerId: string | undefined | null,
    args: UpdateCustomerMemoryArgs,
    schemaName: string,
  ): Promise<string> {
    if (!customerId) {
      return JSON.stringify({ error: 'customer_not_identified' });
    }

    try {
      if (args.memory_type === 'profile') {
        if (!args.data || Object.keys(args.data).length === 0) {
          return JSON.stringify({ error: 'data is required for profile updates' });
        }
        await this.upsertProfile(customerId, args.category, args.data, schemaName);
        return JSON.stringify({
          success: true,
          message: `Perfil actualizado: ${args.category}`,
        });
      }

      if (args.memory_type === 'episode') {
        if (!args.content) {
          return JSON.stringify({ error: 'content is required for episode memories' });
        }
        const result = await this.createEpisode(
          customerId,
          args.content,
          args.category as EpisodeCategory,
          schemaName,
        );
        return JSON.stringify({
          success: true,
          message: `Memoria episódica guardada (${args.category})`,
          episodeId: result.id,
        });
      }

      return JSON.stringify({ error: `Invalid memory_type: ${args.memory_type}` });
    } catch (err: any) {
      return JSON.stringify({ error: err.message });
    }
  }

  // ─── Migration ────────────────────────────────────────────────

  async migrateFromLegacy(schemaName: string): Promise<MigrationResult> {
    const result: MigrationResult = { totalMigrated: 0, skipped: 0, perCustomer: {} };

    // Check if legacy table exists
    const tableExists = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = 'ai_memories'
      ) AS exists
    `, schemaName);

    if (!tableExists[0]?.exists) {
      this.logger.log(`No ai_memories table in ${schemaName}, skipping migration`);
      return result;
    }

    const legacyRecords = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, customer_id, type, content, embedding
      FROM "${schemaName}".ai_memories
      WHERE type IN ('conversation_summary', 'preference', 'order_history')
    `);

    const categoryMap: Record<string, string> = {
      conversation_summary: 'conversation_summary',
      preference: 'preference_detected',
      order_history: 'general_context',
    };

    for (const record of legacyRecords) {
      if (!record.customer_id) {
        this.logger.warn(`Skipping ai_memories record ${record.id}: missing customer_id`);
        result.skipped++;
        continue;
      }

      // Verify customer exists
      const customerExists = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT 1 FROM "${schemaName}".customers WHERE id = $1::uuid
      `, record.customer_id);

      if (customerExists.length === 0) {
        this.logger.warn(`Skipping record ${record.id}: customer ${record.customer_id} not found`);
        result.skipped++;
        continue;
      }

      const newCategory = categoryMap[record.type] ?? 'general_context';

      if (record.embedding) {
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO "${schemaName}".customer_memory_episodes
            (customer_id, content, category, embedding)
          VALUES ($1::uuid, $2, $3, $4::vector)
        `, record.customer_id, record.content, newCategory, record.embedding);
      } else {
        await this.prisma.$executeRawUnsafe(`
          INSERT INTO "${schemaName}".customer_memory_episodes
            (customer_id, content, category)
          VALUES ($1::uuid, $2, $3)
        `, record.customer_id, record.content, newCategory);
      }

      result.totalMigrated++;
      result.perCustomer[record.customer_id] =
        (result.perCustomer[record.customer_id] ?? 0) + 1;
    }

    this.logger.log(
      `Migration complete for ${schemaName}: ${result.totalMigrated} migrated, ${result.skipped} skipped`,
    );
    return result;
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async ensureCustomerExists(customerId: string, schemaName: string): Promise<void> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT 1 FROM "${schemaName}".customers WHERE id = $1::uuid
    `, customerId);

    if (rows.length === 0) {
      throw new NotFoundException(`Customer ${customerId} not found in schema ${schemaName}`);
    }
  }

  // ─── Full Memory Response (for dashboard) ─────────────────────

  async getFullMemory(customerId: string, schemaName: string): Promise<CustomerMemoryResponse> {
    await this.ensureCustomerExists(customerId, schemaName);

    const [profile, episodes] = await Promise.all([
      this.getProfile(customerId, schemaName),
      this.getRecentEpisodes(customerId, schemaName, 20),
    ]);

    return {
      profile: profile ?? {},
      episodes,
    };
  }
}
