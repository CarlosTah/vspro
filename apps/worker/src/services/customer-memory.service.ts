import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../database/prisma.service';

/**
 * Lightweight CustomerMemoryService for the worker process.
 * Provides hybrid retrieval (profile + episodic) for agent context building.
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

  async buildMemoryContext(customerId: string, message: string, schemaName: string): Promise<string> {
    if (!customerId) return '';

    try {
      const [profile, episodes] = await Promise.all([
        this.getProfile(customerId, schemaName),
        this.getRecentEpisodes(customerId, schemaName),
      ]);

      if (!profile && episodes.length === 0) return '';

      const parts: string[] = ['\nMEMORIA DEL CLIENTE:'];
      if (profile && Object.keys(profile).length > 0) {
        parts.push('── Perfil ──');
        for (const [key, value] of Object.entries(profile)) {
          if (value && typeof value === 'object' && Object.keys(value).length > 0) {
            parts.push(`  ${key}: ${JSON.stringify(value)}`);
          }
        }
      }
      if (episodes.length > 0) {
        parts.push('── Recuerdos ──');
        for (const ep of episodes) {
          parts.push(`  [${ep.category}] ${ep.content}`);
        }
      }
      return parts.join('\n') + '\n';
    } catch {
      return '';
    }
  }

  private async getProfile(customerId: string, schema: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT profile FROM "${schema}".customer_memories WHERE customer_id = $1::uuid`,
      customerId,
    );
    return rows[0]?.profile ?? null;
  }

  private async getRecentEpisodes(customerId: string, schema: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT content, category FROM "${schema}".customer_memory_episodes
      WHERE customer_id = $1::uuid ORDER BY created_at DESC LIMIT 5
    `, customerId);
  }
}
