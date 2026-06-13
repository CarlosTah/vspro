import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { CreateChannelDto, UpdateChannelDto } from './dto/channel.dto';
import { randomBytes } from 'crypto';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async findAll(schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, type, external_id AS "externalId",
        webhook_verify_token AS "webhookVerifyToken",
        is_active AS "isActive", config,
        created_at AS "createdAt"
      FROM "${schemaName}".channels
      ORDER BY created_at ASC
    `);
  }

  async findById(id: string, schemaName: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, type, external_id AS "externalId",
        access_token AS "accessToken",
        webhook_verify_token AS "webhookVerifyToken",
        is_active AS "isActive", config,
        created_at AS "createdAt"
      FROM "${schemaName}".channels
      WHERE id = $1::uuid
    `, id);

    if (!rows[0]) throw new NotFoundException('Canal no encontrado');
    return rows[0];
  }

  async create(dto: CreateChannelDto, tenantSlug: string, schemaName: string) {
    // Verificar que no exista ya un canal del mismo tipo
    const existing = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM "${schemaName}".channels WHERE type = $1`,
      dto.type,
    );
    if (existing.length > 0) {
      throw new ConflictException(`Ya existe un canal de tipo ${dto.type}. Edítalo en lugar de crear uno nuevo.`);
    }

    // Generar verify token si no se proporcionó
    const verifyToken = dto.webhookVerifyToken ?? randomBytes(16).toString('hex');

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".channels
        (type, external_id, access_token, webhook_verify_token, is_active, config)
      VALUES ($1, $2, $3, $4, true, $5::jsonb)
      RETURNING id, type, external_id AS "externalId",
                webhook_verify_token AS "webhookVerifyToken",
                is_active AS "isActive", created_at AS "createdAt"
    `,
      dto.type,
      dto.externalId,
      dto.accessToken,
      verifyToken,
      JSON.stringify(dto.config ?? {}),
    );

    const channel = rows[0];

    // Actualizar settings del tenant con el verify token (para el webhook)
    await this.prisma.tenant.update({
      where: { slug: tenantSlug },
      data: {
        settings: { webhookVerifyToken: verifyToken },
      },
    });

    this.logger.log(`Canal ${dto.type} creado para ${tenantSlug}`);

    return {
      channel,
      webhookUrl: this.getWebhookUrl(tenantSlug),
      verifyToken,
      setupInstructions: this.getSetupInstructions(dto.type, tenantSlug, verifyToken),
    };
  }

  async update(id: string, dto: UpdateChannelDto, schemaName: string) {
    await this.findById(id, schemaName);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.accessToken !== undefined) { fields.push(`access_token = $${idx++}`); values.push(dto.accessToken); }
    if (dto.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(dto.isActive); }
    if (dto.config !== undefined) { fields.push(`config = $${idx++}::jsonb`); values.push(JSON.stringify(dto.config)); }

    if (fields.length === 0) return this.findById(id, schemaName);

    values.push(id);
    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".channels SET ${fields.join(', ')} WHERE id = $${idx}::uuid`,
      ...values,
    );

    return this.findById(id, schemaName);
  }

  async delete(id: string, schemaName: string) {
    await this.findById(id, schemaName);
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "${schemaName}".channels WHERE id = $1::uuid`,
      id,
    );
    return { success: true };
  }

  /** Verifica conectividad del canal haciendo una llamada a la API de Meta */
  async testConnection(id: string, schemaName: string) {
    const channel = await this.findById(id, schemaName);

    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${channel.externalId}`,
        { headers: { Authorization: `Bearer ${channel.accessToken}` } },
      );
      const data = await res.json() as any;

      if (data.error) {
        return { connected: false, error: data.error.message };
      }

      return { connected: true, data: { id: data.id, name: data.verified_name ?? data.name } };
    } catch (err: any) {
      return { connected: false, error: err.message };
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private getWebhookUrl(tenantSlug: string): string {
    const apiUrl = this.config.get('API_URL', 'http://localhost:3001');
    return `${apiUrl}/webhooks/meta/${tenantSlug}`;
  }

  private getSetupInstructions(type: string, tenantSlug: string, verifyToken: string) {
    const webhookUrl = this.getWebhookUrl(tenantSlug);

    if (type === 'whatsapp') {
      return {
        steps: [
          '1. Ve a https://developers.facebook.com → tu app → WhatsApp → Configuration',
          '2. En "Webhook", haz clic en "Edit"',
          `3. Callback URL: ${webhookUrl}`,
          `4. Verify Token: ${verifyToken}`,
          '5. Haz clic en "Verify and Save"',
          '6. Suscríbete al campo "messages"',
          '7. ¡Listo! Los mensajes llegarán automáticamente',
        ],
        webhookUrl,
        verifyToken,
      };
    }

    return {
      steps: [
        '1. Ve a https://developers.facebook.com → tu app → Webhooks',
        `2. Callback URL: ${webhookUrl}`,
        `3. Verify Token: ${verifyToken}`,
        '4. Suscríbete a los eventos de mensajes',
      ],
      webhookUrl,
      verifyToken,
    };
  }
}
