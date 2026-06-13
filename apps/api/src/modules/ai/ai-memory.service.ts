import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';

/**
 * Servicio de memoria de IA por tenant.
 * Usa pgvector para almacenar embeddings de:
 * - Historial de conversaciones del cliente
 * - Preferencias detectadas
 * - Pedidos anteriores
 *
 * Se inyecta como contexto adicional en cada mensaje procesado por la IA.
 */
@Injectable()
export class AiMemoryService {
  private readonly logger = new Logger(AiMemoryService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get('OPENAI_API_KEY');
    this.openai = key && key !== 'sk-test-not-real' ? new OpenAI({ apiKey: key }) : null;
  }

  /**
   * Genera embedding de un texto usando text-embedding-3-small.
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.openai) return null;

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    } catch (err) {
      this.logger.error('Error generando embedding:', err);
      return null;
    }
  }

  /**
   * Guarda un recuerdo (memoria) del cliente.
   * Se llama después de cada conversación significativa.
   */
  async saveMemory(
    customerId: string,
    type: 'preference' | 'order_history' | 'conversation_summary',
    content: string,
    schemaName: string,
  ) {
    const embedding = await this.generateEmbedding(content);

    // Verificar si la tabla existe (se crea con el schema del tenant)
    await this.ensureMemoryTable(schemaName);

    if (embedding) {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".ai_memories
          (customer_id, type, content, embedding)
        VALUES ($1::uuid, $2, $3, $4::vector)
      `, customerId, type, content, `[${embedding.join(',')}]`);
    } else {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".ai_memories
          (customer_id, type, content)
        VALUES ($1::uuid, $2, $3)
      `, customerId, type, content);
    }
  }

  /**
   * Recupera memorias relevantes para el contexto actual.
   * Usa búsqueda semántica con pgvector si hay embedding disponible.
   */
  async getRelevantMemories(
    customerId: string,
    currentMessage: string,
    schemaName: string,
    limit = 5,
  ): Promise<string[]> {
    await this.ensureMemoryTable(schemaName);

    const embedding = await this.generateEmbedding(currentMessage);

    let memories: any[];

    if (embedding) {
      // Búsqueda semántica — las memorias más relevantes al mensaje actual
      memories = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT content, type,
               1 - (embedding <=> $1::vector) AS similarity
        FROM "${schemaName}".ai_memories
        WHERE customer_id = $2::uuid
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $3
      `, `[${embedding.join(',')}]`, customerId, limit);
    } else {
      // Sin embeddings — retornar las más recientes
      memories = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT content, type
        FROM "${schemaName}".ai_memories
        WHERE customer_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT $2
      `, customerId, limit);
    }

    return memories.map((m) => `[${m.type}] ${m.content}`);
  }

  /**
   * Obtiene el resumen de memoria de un cliente (para el panel admin).
   */
  async getCustomerMemories(customerId: string, schemaName: string) {
    await this.ensureMemoryTable(schemaName);

    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, type, content, created_at AS "createdAt"
      FROM "${schemaName}".ai_memories
      WHERE customer_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 20
    `, customerId);
  }

  /**
   * Genera un resumen de la conversación y lo guarda como memoria.
   * Se llama al resolver una conversación.
   */
  async summarizeAndSave(
    customerId: string,
    conversationMessages: string[],
    schemaName: string,
  ) {
    if (!this.openai || conversationMessages.length < 3) return;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Resume esta conversación en 1-2 oraciones. Enfócate en: qué pidió el cliente, preferencias detectadas, y cualquier dato relevante para futuras interacciones.',
          },
          {
            role: 'user',
            content: conversationMessages.join('\n'),
          },
        ],
        max_tokens: 150,
      });

      const summary = response.choices[0]?.message?.content;
      if (summary) {
        await this.saveMemory(customerId, 'conversation_summary', summary, schemaName);
        this.logger.debug(`Memoria guardada para cliente ${customerId}`);
      }
    } catch (err) {
      this.logger.error('Error generando resumen:', err);
    }
  }

  /**
   * Construye el contexto de memoria para inyectar en el prompt de la IA.
   */
  async buildMemoryContext(
    customerId: string,
    currentMessage: string,
    schemaName: string,
  ): Promise<string> {
    const memories = await this.getRelevantMemories(customerId, currentMessage, schemaName);

    if (memories.length === 0) return '';

    return `\nMEMORIA DEL CLIENTE (información de interacciones anteriores):\n${memories.join('\n')}\n`;
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async ensureMemoryTable(schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".ai_memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID NOT NULL,
        type VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_ai_memories_customer
        ON "${schemaName}".ai_memories(customer_id)
    `);
  }
}
