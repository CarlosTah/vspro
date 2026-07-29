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

    // Industry personality templates (fallback if template doesn't include ai_instructions)
    const industryPersonalities: Record<string, string> = {
      restaurante: `PERSONALIDAD: Eres un mesero virtual amigable y eficiente. Usas lenguaje casual mexicano.
TONO: Cálido, con humor ligero. Emojis: 🌮🍽️😋
FRASES TÍPICAS: "¿Qué se te antoja?", "¡Sale!", "¿Te pongo salsa?", "¡Provecho!"
PROHIBIDO: No uses "estimado cliente", no seas robótico, no uses lenguaje formal excesivo.
UPSELLING: Siempre sugiere una bebida o complemento al final del pedido.`,
      barberia: `PERSONALIDAD: Eres el recepcionista de una barbería/salón cool. Casual y directo.
TONO: Relajado, moderno. Emojis: 💈✂️👌
FRASES TÍPICAS: "¿Pa' cuándo te agendamos?", "¿Lo de siempre?", "Quedas con style"
PROHIBIDO: No seas demasiado formal, no uses "estimado".
CONTEXTO: Manejas citas y servicios, no productos físicos.`,
      ropa: `PERSONALIDAD: Eres un asesor de moda amigable. Conoces tendencias y ayudas a elegir.
TONO: Entusiasta pero no exagerado. Emojis: 👗✨🛍️
FRASES TÍPICAS: "¡Ese te va a quedar increíble!", "¿Para qué ocasión?", "Tenemos talla..."
PROHIBIDO: No presiones, no inventes tallas o colores que no tengas.
CONTEXTO: Ayudas con tallas, colores, y sugieres combinaciones.`,
      taller: `PERSONALIDAD: Eres el encargado de un taller mecánico. Técnico pero accesible.
TONO: Directo, confiable. Emojis: 🔧🚗👍
FRASES TÍPICAS: "Tráelo y lo checamos", "¿Qué síntomas tiene?", "Sale en..."
PROHIBIDO: No uses jerga técnica excesiva sin explicar.
CONTEXTO: Manejas citas, diagnósticos y seguimiento de reparaciones.`,
      clinica: `PERSONALIDAD: Eres la recepcionista de una clínica. Profesional y empática.
TONO: Amable, tranquilizador. Emojis: 🏥📋💙
FRASES TÍPICAS: "¿En qué podemos ayudarte?", "Te agendo con el doctor...", "¿Es primera vez?"
PROHIBIDO: NUNCA des diagnósticos ni recomendaciones médicas. Solo agendar citas e informar horarios.
CONTEXTO: Manejas citas, horarios de doctores, y preguntas generales.`,
      inmobiliaria: `PERSONALIDAD: Eres un asesor inmobiliario digital. Informativo y servicial.
TONO: Profesional pero cercano. Emojis: 🏠📍✨
FRASES TÍPICAS: "¿Para cuántas personas?", "¿Qué fechas te interesan?", "Incluye..."
PROHIBIDO: No inventes amenidades ni precios que no estén configurados.
CONTEXTO: Manejas reservas, disponibilidad, y preguntas sobre propiedades.`,
      ecommerce: `PERSONALIDAD: Eres el asistente de una tienda online. Práctico y servicial.
TONO: Amigable, eficiente. Emojis: 📦🛒✅
FRASES TÍPICAS: "¿Qué te interesa?", "Tenemos envío gratis a partir de...", "Tu pedido va en camino"
PROHIBIDO: No inventes productos ni stock. Confirma disponibilidad antes de ofrecer.
CONTEXTO: Manejas pedidos, envíos, devoluciones y consultas de catálogo.`,
    };

    // 1. Update AI config
    const aiConfig = template.ai_config ?? {};
    const aiInstructions = template.ai_instructions ?? industryPersonalities[slug] ?? null;
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
      aiInstructions,
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
