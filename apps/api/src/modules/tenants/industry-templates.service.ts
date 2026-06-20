import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class IndustryTemplatesService {
  private readonly logger = new Logger(IndustryTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listTemplates() {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT slug, name, icon, description FROM public.industry_templates ORDER BY name
    `);
  }

  async getTemplate(slug: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM public.industry_templates WHERE slug = $1`, slug,
    );
    if (!rows[0]) throw new NotFoundException(`Template '${slug}' not found`);
    return rows[0];
  }

  /**
   * Apply an industry template to a tenant schema.
   * Sets: AI config, products, knowledge base, business hours.
   */
  async applyTemplate(slug: string, schemaName: string): Promise<{ applied: string; products: number; kbEntries: number }> {
    const template = await this.getTemplate(slug);

    this.logger.log(`Applying template '${slug}' to schema ${schemaName}`);

    // 1. Update AI config
    const aiConfig = template.ai_config ?? {};
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".ai_config SET
        assistant_name = COALESCE($1, assistant_name),
        tone = COALESCE($2, tone),
        welcome_message = COALESCE($3, welcome_message),
        custom_instructions = COALESCE($4, custom_instructions),
        business_hours = COALESCE($5::jsonb, business_hours),
        updated_at = NOW()
      WHERE id = (SELECT id FROM "${schemaName}".ai_config LIMIT 1)
    `,
      aiConfig.assistantName ?? null,
      aiConfig.tone ?? null,
      aiConfig.welcomeMessage ?? null,
      template.ai_instructions ?? null,
      template.business_hours ? JSON.stringify(template.business_hours) : null,
    );

    // 2. Insert sample products
    const products = template.sample_products ?? [];
    let productsCreated = 0;
    for (const p of products) {
      const sku = `TPL-${slug.slice(0, 3).toUpperCase()}-${String(productsCreated + 1).padStart(3, '0')}`;
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".products (name, price, category, sku, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (sku) DO NOTHING
      `, p.name, p.price, p.category ?? 'General', sku);
      productsCreated++;
    }

    // Create inventory for new products
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".inventory (product_id, stock_available, stock_minimum)
      SELECT id, 50, 5 FROM "${schemaName}".products
      WHERE id NOT IN (SELECT product_id FROM "${schemaName}".inventory)
    `);

    // 3. Insert knowledge base entries
    const kbEntries = template.knowledge_base ?? [];
    let kbCreated = 0;
    for (const kb of kbEntries) {
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".knowledge_base (title, content, category, sort_order)
        VALUES ($1, $2, 'template', $3)
      `, kb.title, kb.content, kbCreated);
      kbCreated++;
    }

    this.logger.log(`Template '${slug}' applied: ${productsCreated} products, ${kbCreated} KB entries`);

    return { applied: slug, products: productsCreated, kbEntries: kbCreated };
  }
}
