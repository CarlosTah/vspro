import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';

/**
 * Menu Vision Service — Extracts products from menu images using GPT-4o Vision.
 *
 * Capabilities:
 * - Parse menu photos (pizarrón, lona, carta, hoja impresa, pizarra)
 * - Extract: name, price, category, description
 * - Handle multiple formats (columns, tables, handwritten, printed)
 * - Support partial/unclear images (asks for confirmation)
 * - Bulk-create products in tenant schema on approval
 */

export interface ParsedMenuItem {
  name: string;
  price: number;
  category: string;
  description?: string;
  confidence: number; // 0-1, how sure the parser is about this item
}

export interface MenuParseResult {
  items: ParsedMenuItem[];
  totalItems: number;
  parsedAt: string;
  imageUrl?: string;
  warnings: string[];
  rawResponse?: string;
}

export interface ApproveMenuDto {
  items: ParsedMenuItem[];
  defaultStock?: number;
}

@Injectable()
export class MenuVisionService {
  private readonly logger = new Logger(MenuVisionService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') });
  }

  // ─── Core: Parse Menu Image ───────────────────────────────────

  /**
   * Parse a menu image using GPT-4o Vision.
   * Accepts a URL (S3, CDN) or base64 data URI.
   */
  async parseMenuImage(imageUrl: string): Promise<MenuParseResult> {
    if (!imageUrl) {
      throw new BadRequestException('imageUrl is required');
    }

    this.logger.log('Parsing menu image with GPT-4o Vision...');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Eres un experto en OCR de menús de restaurantes y negocios de comida mexicanos.
Tu trabajo es extraer TODOS los productos/platillos visibles en la imagen del menú.

REGLAS:
- Extrae cada platillo/producto como un objeto JSON
- Incluye: name (nombre exacto como aparece), price (número decimal en MXN), category (categoría lógica), description (breve, opcional)
- Si un precio no es legible, pon 0 y marca confidence bajo
- Si un nombre es parcialmente legible, incluye lo que puedas leer
- Agrupa por categorías lógicas (Tacos, Bebidas, Postres, Combos, etc.)
- Los precios en México usan $ sin centavos generalmente
- Ignora textos que no son productos (horarios, direcciones, decoración)
- Confidence: 1.0 = seguro, 0.7 = probable, 0.5 = incierto

Responde SOLO con JSON válido:
{
  "items": [{"name":"...", "price":0.00, "category":"...", "description":"...", "confidence":0.9}],
  "warnings": ["texto sobre problemas de lectura"]
}`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extrae todos los productos de este menú. Incluye nombre, precio, categoría y descripción cuando sea posible.',
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content ?? '{"items":[],"warnings":["No se pudo leer la imagen"]}';

    try {
      // Clean response (remove markdown code blocks if present)
      const cleaned = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleaned);

      const result: MenuParseResult = {
        items: (parsed.items ?? []).map((item: any) => ({
          name: item.name?.trim() ?? 'Sin nombre',
          price: typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0,
          category: item.category?.trim() ?? 'General',
          description: item.description?.trim() || undefined,
          confidence: item.confidence ?? 0.8,
        })),
        totalItems: parsed.items?.length ?? 0,
        parsedAt: new Date().toISOString(),
        imageUrl,
        warnings: parsed.warnings ?? [],
      };

      this.logger.log(`Menu parsed: ${result.totalItems} items extracted`);
      return result;

    } catch (err: any) {
      this.logger.error(`Failed to parse GPT response: ${err.message}`);
      return {
        items: [],
        totalItems: 0,
        parsedAt: new Date().toISOString(),
        imageUrl,
        warnings: ['No se pudo interpretar la respuesta de la IA. Intenta con una imagen más clara.'],
        rawResponse: content,
      };
    }
  }

  // ─── Approve & Create Products ────────────────────────────────

  /**
   * Approve parsed menu items and create products + inventory in tenant schema.
   * Called after the owner reviews and optionally edits the parsed items.
   */
  async approveAndCreateProducts(
    dto: ApproveMenuDto,
    schemaName: string,
  ): Promise<{ created: number; skipped: number; products: any[] }> {
    const { items, defaultStock = 50 } = dto;

    if (!items || items.length === 0) {
      throw new BadRequestException('No hay items para dar de alta');
    }

    let created = 0;
    let skipped = 0;
    const createdProducts: any[] = [];

    for (const item of items) {
      // Skip items with no name or 0 price
      if (!item.name || item.name === 'Sin nombre') {
        skipped++;
        continue;
      }

      // Check if product already exists (by name, case-insensitive)
      const existing = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT id FROM "${schemaName}".products
        WHERE LOWER(name) = LOWER($1) AND is_active = true
      `, item.name);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Generate SKU from name
      const sku = this.generateSku(item.name, item.category, created);

      // Create product
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        INSERT INTO "${schemaName}".products
          (name, price, category, description, sku, is_active)
        VALUES ($1, $2, $3, $4, $5, true)
        RETURNING id, name, price, category, sku
      `,
        item.name,
        item.price,
        item.category,
        item.description ?? null,
        sku,
      );

      const product = rows[0];

      // Create inventory record
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".inventory
          (product_id, stock_available, stock_minimum)
        VALUES ($1::uuid, $2, 5)
        ON CONFLICT (product_id) DO NOTHING
      `, product.id, defaultStock);

      createdProducts.push(product);
      created++;
    }

    this.logger.log(`[${schemaName}] Menu approved: ${created} created, ${skipped} skipped`);

    return { created, skipped, products: createdProducts };
  }

  // ─── Format for WhatsApp display ──────────────────────────────

  /**
   * Format parsed items as a WhatsApp-friendly message for owner review.
   */
  formatForReview(result: MenuParseResult): string {
    if (result.items.length === 0) {
      return '❌ No pude leer productos de esa imagen. ¿Puedes enviar una foto más clara?';
    }

    let msg = `📋 *Menú detectado* (${result.totalItems} productos)\n\n`;

    // Group by category
    const byCategory = new Map<string, ParsedMenuItem[]>();
    for (const item of result.items) {
      const cat = item.category;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(item);
    }

    for (const [category, items] of byCategory) {
      msg += `*${category}*\n`;
      for (const item of items) {
        const priceStr = item.price > 0 ? `$${item.price}` : '⚠️ sin precio';
        const conf = item.confidence < 0.7 ? ' ⚠️' : '';
        msg += `  • ${item.name} — ${priceStr}${conf}\n`;
      }
      msg += '\n';
    }

    if (result.warnings.length > 0) {
      msg += `⚠️ Notas: ${result.warnings.join(', ')}\n\n`;
    }

    msg += '¿Todo correcto? Responde:\n';
    msg += '✅ *"Aprobar"* — para dar de alta todo\n';
    msg += '✏️ *"Editar"* — si quieres cambiar algo\n';
    msg += '📷 *Envía otra foto* — si la lectura no fue correcta';

    return msg;
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private generateSku(name: string, category: string, index: number): string {
    const catPrefix = category
      .slice(0, 3)
      .toUpperCase()
      .replace(/[^A-Z]/g, 'X');
    const namePrefix = name
      .slice(0, 3)
      .toUpperCase()
      .replace(/[^A-Z]/g, 'X');
    return `${catPrefix}-${namePrefix}-${String(index + 1).padStart(3, '0')}`;
  }
}
