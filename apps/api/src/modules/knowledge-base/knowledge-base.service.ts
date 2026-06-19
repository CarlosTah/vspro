import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

  constructor(private readonly prisma: PrismaService) {}

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
    const rows = await this.prisma.$queryRawUnsafe<KnowledgeBaseEntry[]>(`
      INSERT INTO "${schemaName}".knowledge_base (title, content, category, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING id, title, content, category,
                is_active AS "isActive",
                sort_order AS "sortOrder",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
    `, dto.title, dto.content, dto.category ?? 'general', dto.sortOrder ?? 0);

    this.logger.log(`KB entry created: "${dto.title}" in ${schemaName}`);
    return rows[0];
  }

  async update(id: string, dto: UpdateKbEntryDto, schemaName: string): Promise<KnowledgeBaseEntry> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.title !== undefined) { fields.push(`title = $${idx++}`); values.push(dto.title); }
    if (dto.content !== undefined) { fields.push(`content = $${idx++}`); values.push(dto.content); }
    if (dto.category !== undefined) { fields.push(`category = $${idx++}`); values.push(dto.category); }
    if (dto.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(dto.isActive); }
    if (dto.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(dto.sortOrder); }

    if (fields.length === 0) return this.findById(id, schemaName);

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
   * Builds a knowledge base context string for injection into the AI system prompt.
   * Only includes active entries.
   */
  async buildKnowledgeContext(schemaName: string): Promise<string> {
    const entries = await this.findAll(schemaName, true);
    if (entries.length === 0) return '';

    const sections = entries.map(e => `### ${e.title}\n${e.content}`);
    return `\n\n## BASE DE CONOCIMIENTO\n${sections.join('\n\n')}`;
  }
}
