import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateAiConfigDto } from './dto/ai-config.dto';

@Injectable()
export class AiConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(schemaName: string) {
    // Ensure agent_config column exists
    await this.prisma.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".ai_config ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}'`
    );

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
        agent_config->'businessData' AS "businessData",
        agent_config->'objectives' AS "objectives",
        agent_config->'redLines' AS "redLines",
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

    if (fields.length === 0 && !dto.businessData) return this.getConfig(schemaName);

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      await this.prisma.$executeRawUnsafe(
        `UPDATE "${schemaName}".ai_config SET ${fields.join(', ')} WHERE id = (SELECT id FROM "${schemaName}".ai_config LIMIT 1)`,
        ...values,
      );
    }

    // Store businessData in agent_config JSONB
    if (dto.businessData) {
      await this.prisma.$executeRawUnsafe(`
        ALTER TABLE "${schemaName}".ai_config ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}'
      `);
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".ai_config
        SET agent_config = jsonb_set(
          COALESCE(agent_config, '{}'::jsonb),
          '{businessData}',
          $1::jsonb
        ), updated_at = NOW()
        WHERE id = (SELECT id FROM "${schemaName}".ai_config LIMIT 1)
      `, JSON.stringify(dto.businessData));
    }

    // Store objectives and redLines in agent_config
    if (dto.objectives !== undefined) {
      await this.prisma.$executeRawUnsafe(`
        ALTER TABLE "${schemaName}".ai_config ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}'
      `);
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".ai_config
        SET agent_config = jsonb_set(COALESCE(agent_config, '{}'::jsonb), '{objectives}', $1::jsonb), updated_at = NOW()
        WHERE id = (SELECT id FROM "${schemaName}".ai_config LIMIT 1)
      `, JSON.stringify(dto.objectives));
    }

    if (dto.redLines !== undefined) {
      await this.prisma.$executeRawUnsafe(`
        ALTER TABLE "${schemaName}".ai_config ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}'
      `);
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".ai_config
        SET agent_config = jsonb_set(COALESCE(agent_config, '{}'::jsonb), '{redLines}', $1::jsonb), updated_at = NOW()
        WHERE id = (SELECT id FROM "${schemaName}".ai_config LIMIT 1)
      `, JSON.stringify(dto.redLines));
    }

    return this.getConfig(schemaName);
  }
}
