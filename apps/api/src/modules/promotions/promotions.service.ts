import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/promotion.dto';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureTable(schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".promotions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(255) NOT NULL,
        description     TEXT,
        type            VARCHAR(50) NOT NULL DEFAULT 'combo',
        status          VARCHAR(50) NOT NULL DEFAULT 'active',
        rules           JSONB NOT NULL DEFAULT '{}',
        starts_at       TIMESTAMPTZ,
        ends_at         TIMESTAMPTZ,
        max_uses        INTEGER,
        current_uses    INTEGER NOT NULL DEFAULT 0,
        days_active     JSONB DEFAULT '["mon","tue","wed","thu","fri","sat","sun"]',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async findAll(schemaName: string) {
    await this.ensureTable(schemaName);
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, name, description, type, status, rules,
        starts_at AS "startsAt", ends_at AS "endsAt",
        max_uses AS "maxUses", current_uses AS "currentUses",
        days_active AS "daysActive",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM "${schemaName}".promotions
      ORDER BY created_at DESC
    `);
  }

  async findActive(schemaName: string) {
    await this.ensureTable(schemaName);
    const now = new Date().toISOString();
    // Get current day abbreviation
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const today = dayMap[new Date().getDay()];

    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, name, description, type, status, rules,
        starts_at AS "startsAt", ends_at AS "endsAt",
        max_uses AS "maxUses", current_uses AS "currentUses",
        days_active AS "daysActive"
      FROM "${schemaName}".promotions
      WHERE status = 'active'
        AND (starts_at IS NULL OR starts_at <= $1::timestamptz)
        AND (ends_at IS NULL OR ends_at > $1::timestamptz)
        AND (max_uses IS NULL OR current_uses < max_uses)
        AND (days_active IS NULL OR days_active @> $2::jsonb)
      ORDER BY type, name
    `, now, JSON.stringify(today));
  }

  async findById(id: string, schemaName: string) {
    await this.ensureTable(schemaName);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, name, description, type, status, rules,
        starts_at AS "startsAt", ends_at AS "endsAt",
        max_uses AS "maxUses", current_uses AS "currentUses",
        days_active AS "daysActive",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM "${schemaName}".promotions
      WHERE id = $1::uuid
    `, id);

    if (!rows[0]) throw new NotFoundException(`Promoción ${id} no encontrada`);
    return rows[0];
  }

  async create(dto: CreatePromotionDto, schemaName: string) {
    await this.ensureTable(schemaName);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".promotions
        (name, description, type, rules, starts_at, ends_at, max_uses, days_active)
      VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz, $7, $8::jsonb)
      RETURNING
        id, name, description, type, status, rules,
        starts_at AS "startsAt", ends_at AS "endsAt",
        max_uses AS "maxUses", current_uses AS "currentUses",
        days_active AS "daysActive",
        created_at AS "createdAt"
    `,
      dto.name,
      dto.description ?? null,
      dto.type,
      JSON.stringify(dto.rules),
      dto.startsAt ?? null,
      dto.endsAt ?? null,
      dto.maxUses ?? null,
      JSON.stringify(dto.daysActive ?? ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
    );
    return rows[0];
  }

  async update(id: string, dto: UpdatePromotionDto, schemaName: string) {
    await this.findById(id, schemaName);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.name !== undefined) { fields.push(`name = $${idx++}`); values.push(dto.name); }
    if (dto.description !== undefined) { fields.push(`description = $${idx++}`); values.push(dto.description); }
    if (dto.type !== undefined) { fields.push(`type = $${idx++}`); values.push(dto.type); }
    if (dto.status !== undefined) { fields.push(`status = $${idx++}`); values.push(dto.status); }
    if (dto.rules !== undefined) { fields.push(`rules = $${idx++}::jsonb`); values.push(JSON.stringify(dto.rules)); }
    if (dto.startsAt !== undefined) { fields.push(`starts_at = $${idx++}::timestamptz`); values.push(dto.startsAt); }
    if (dto.endsAt !== undefined) { fields.push(`ends_at = $${idx++}::timestamptz`); values.push(dto.endsAt); }
    if (dto.maxUses !== undefined) { fields.push(`max_uses = $${idx++}`); values.push(dto.maxUses); }
    if (dto.daysActive !== undefined) { fields.push(`days_active = $${idx++}::jsonb`); values.push(JSON.stringify(dto.daysActive)); }

    if (fields.length === 0) return this.findById(id, schemaName);

    fields.push('updated_at = NOW()');
    values.push(id);

    await this.prisma.$executeRawUnsafe(
      `UPDATE "${schemaName}".promotions SET ${fields.join(', ')} WHERE id = $${idx}::uuid`,
      ...values,
    );

    return this.findById(id, schemaName);
  }

  async remove(id: string, schemaName: string) {
    await this.findById(id, schemaName);
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "${schemaName}".promotions WHERE id = $1::uuid`, id,
    );
    return { success: true };
  }

  async incrementUses(id: string, schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".promotions
      SET current_uses = current_uses + 1, updated_at = NOW()
      WHERE id = $1::uuid
    `, id);
  }

  /**
   * Build promotions context for the AI agent prompt.
   * Returns a string describing active combos/promos for the system prompt.
   */
  async buildPromotionsContext(schemaName: string): Promise<string> {
    const promos = await this.findActive(schemaName);
    if (promos.length === 0) return '';

    let ctx = '\n\nPROMOCIONES Y COMBOS ACTIVOS:\n';
    for (const p of promos) {
      const rules = p.rules as any;
      switch (p.type) {
        case 'combo':
          ctx += `- 🎉 COMBO "${p.name}": ${p.description ?? ''} — Precio combo: $${rules.comboPrice}\n`;
          if (rules.products?.length) {
            ctx += `  Incluye: ${rules.products.map((pr: any) => `${pr.quantity}x ${pr.productName ?? pr.productId}`).join(', ')}\n`;
          }
          break;
        case 'discount':
          const discDesc = rules.discountType === 'percentage'
            ? `${rules.discountValue}% de descuento`
            : `$${rules.discountValue} de descuento`;
          ctx += `- 💸 DESCUENTO "${p.name}": ${discDesc}`;
          if (rules.minOrderTotal) ctx += ` (mínimo $${rules.minOrderTotal})`;
          ctx += '\n';
          break;
        case 'bogo':
          ctx += `- 🎁 "${p.name}": Compra ${rules.buyQuantity} y lleva ${rules.getQuantity} gratis\n`;
          break;
        case 'bundle':
          ctx += `- 📦 PAQUETE "${p.name}": ${p.description ?? ''} — $${rules.bundlePrice} (ahorras $${rules.savings ?? ''})\n`;
          break;
      }
    }
    ctx += '\nINSTRUCCIONES DE PROMOCIONES:\n';
    ctx += '- Si el cliente pregunta por promociones, informa las activas listadas arriba.\n';
    ctx += '- Si el pedido del cliente coincide con un combo/bundle, OFRÉCELO proactivamente.\n';
    ctx += '- Aplica descuentos automáticamente si se cumple el mínimo de compra.\n';
    ctx += '- Para BOGO, si el cliente pide la cantidad requerida, informa que lleva producto gratis.\n';
    ctx += '- Usa apply_promotion con el promotionId cuando apliques una promo al pedido.\n';

    return ctx;
  }
}
