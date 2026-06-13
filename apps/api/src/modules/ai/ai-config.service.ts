import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateAiConfigDto } from './dto/ai-config.dto';

@Injectable()
export class AiConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id,
        assistant_name AS "assistantName",
        tone,
        welcome_message AS "welcomeMessage",
        away_message AS "awayMessage",
        language,
        business_hours AS "businessHours",
        custom_instructions AS "customInstructions",
        updated_at AS "updatedAt"
      FROM "${schemaName}".ai_config
      LIMIT 1
    `);

    if (!rows[0]) throw new NotFoundException('Configuración de IA no encontrada');
    return rows[0];
  }

  async updateConfig(dto: UpdateAiConfigDto, schemaName: string) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.assistantName !== undefined) { fields.push(`assistant_name = $${idx++}`); values.push(dto.assistantName); }
    if (dto.tone !== undefined) { fields.push(`tone = $${idx++}`); values.push(dto.tone); }
    if (dto.welcomeMessage !== undefined) { fields.push(`welcome_message = $${idx++}`); values.push(dto.welcomeMessage); }
    if (dto.awayMessage !== undefined) { fields.push(`away_message = $${idx++}`); values.push(dto.awayMessage); }
    if (dto.language !== undefined) { fields.push(`language = $${idx++}`); values.push(dto.language); }
    if (dto.customInstructions !== undefined) { fields.push(`custom_instructions = $${idx++}`); values.push(dto.customInstructions); }
    if (dto.businessHours !== undefined) { fields.push(`business_hours = $${idx++}::jsonb`); values.push(JSON.stringify(dto.businessHours)); }

    if (fields.length === 0) return this.getConfig(schemaName);

    fields.push(`updated_at = NOW()`);

    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".ai_config SET ${fields.join(', ')} WHERE id = (SELECT id FROM "${schemaName}".ai_config LIMIT 1)`,
      ...values,
    );

    return this.getConfig(schemaName);
  }
}
