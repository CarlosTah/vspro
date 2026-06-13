import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Catalog Visual Tool — Enables the AI to show products with images via WhatsApp.
 *
 * When the customer asks "what do you have?" or "show me dresses",
 * the AI calls this tool to get product data formatted for visual display.
 *
 * The response includes image URLs that the MessagingFactory will send
 * as WhatsApp image messages with captions.
 *
 * Tool names registered in AiEngineService:
 * - show_catalog: Returns top products with images for a category/query
 * - show_product_detail: Returns full detail of a specific product
 */
@Injectable()
export class CatalogVisualTool {
  private readonly logger = new Logger(CatalogVisualTool.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get products for visual display (images + captions).
   * Returns formatted data that the AI converts into image messages.
   */
  async showCatalog(
    args: { query?: string; category?: string; limit?: number },
    schemaName: string,
  ): Promise<CatalogResponse> {
    const limit = Math.min(args.limit ?? 5, 10); // Max 10 products per request

    let products: any[];

    if (args.query) {
      products = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT p.id, p.name, p.description, p.price, p.category, p.images,
               i.stock_available
        FROM "${schemaName}".products p
        LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
        WHERE p.is_active = true
          AND (p.name ILIKE $1 OR p.description ILIKE $1 OR p.category ILIKE $1)
        ORDER BY i.stock_available DESC NULLS LAST
        LIMIT $2
      `, `%${args.query}%`, limit);
    } else if (args.category) {
      products = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT p.id, p.name, p.description, p.price, p.category, p.images,
               i.stock_available
        FROM "${schemaName}".products p
        LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
        WHERE p.is_active = true AND p.category ILIKE $1
        ORDER BY p.price ASC
        LIMIT $2
      `, `%${args.category}%`, limit);
    } else {
      // Show top/featured products
      products = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT p.id, p.name, p.description, p.price, p.category, p.images,
               i.stock_available
        FROM "${schemaName}".products p
        LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
        WHERE p.is_active = true AND i.stock_available > 0
        ORDER BY p.created_at DESC
        LIMIT $1
      `, limit);
    }

    const items: CatalogItem[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      price: parseFloat(p.price),
      category: p.category ?? '',
      imageUrl: this.getPrimaryImage(p.images),
      inStock: (p.stock_available ?? 0) > 0,
      stockAvailable: p.stock_available ?? 0,
    }));

    return {
      items,
      total: items.length,
      hasImages: items.some((i) => i.imageUrl !== null),
      formatted: this.formatForWhatsApp(items),
    };
  }

  /**
   * Get full detail of a single product including variants.
   */
  async showProductDetail(
    args: { productId?: string; productName?: string },
    schemaName: string,
  ): Promise<ProductDetailResponse> {
    let product: any;

    if (args.productId) {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT p.*, i.stock_available, i.stock_minimum
        FROM "${schemaName}".products p
        LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
        WHERE p.id = $1::uuid
      `, args.productId);
      product = rows[0];
    } else if (args.productName) {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT p.*, i.stock_available, i.stock_minimum
        FROM "${schemaName}".products p
        LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
        WHERE p.is_active = true AND p.name ILIKE $1
        LIMIT 1
      `, `%${args.productName}%`);
      product = rows[0];
    }

    if (!product) {
      return { found: false, product: null, variants: [], formatted: 'Producto no encontrado.' };
    }

    // Get variants
    const variants = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, name, price, stock_available, attributes
      FROM "${schemaName}".product_variants
      WHERE product_id = $1::uuid AND is_active = true
      ORDER BY name
    `, product.id);

    const detail: ProductDetail = {
      id: product.id,
      name: product.name,
      description: product.description ?? '',
      price: parseFloat(product.price),
      category: product.category ?? '',
      images: product.images ?? [],
      inStock: (product.stock_available ?? 0) > 0,
      stockAvailable: product.stock_available ?? 0,
    };

    const variantList = variants.map((v: any) => ({
      id: v.id,
      name: v.name,
      price: v.price ? parseFloat(v.price) : detail.price,
      inStock: (v.stock_available ?? 0) > 0,
      attributes: v.attributes ?? {},
    }));

    return {
      found: true,
      product: detail,
      variants: variantList,
      formatted: this.formatDetailForWhatsApp(detail, variantList),
    };
  }

  /**
   * Get available categories for the tenant catalog.
   */
  async getCategories(schemaName: string): Promise<string[]> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT DISTINCT category FROM "${schemaName}".products
      WHERE is_active = true AND category IS NOT NULL
      ORDER BY category
    `);
    return rows.map((r) => r.category);
  }

  // ─── Formatting for WhatsApp ──────────────────────────────────

  private formatForWhatsApp(items: CatalogItem[]): string {
    if (items.length === 0) return 'No encontré productos disponibles.';

    const lines = items.map((item, i) => {
      const stock = item.inStock ? '✅' : '❌ Agotado';
      const img = item.imageUrl ? '📷' : '';
      return `${i + 1}. *${item.name}* — $${item.price.toLocaleString()} ${stock} ${img}\n   ${item.description.slice(0, 60)}${item.description.length > 60 ? '...' : ''}`;
    });

    return `🛍️ *Catálogo* (${items.length} productos)\n\n${lines.join('\n\n')}\n\n¿Te interesa alguno? Dime el nombre o número.`;
  }

  private formatDetailForWhatsApp(product: ProductDetail, variants: any[]): string {
    let msg = `📦 *${product.name}*\n`;
    msg += `💰 $${product.price.toLocaleString()}\n`;
    msg += `${product.inStock ? '✅ Disponible' : '❌ Agotado'} (${product.stockAvailable} en stock)\n`;
    if (product.description) msg += `\n${product.description}\n`;

    if (variants.length > 0) {
      msg += `\n📐 *Opciones disponibles:*\n`;
      for (const v of variants) {
        const attrs = Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(', ');
        msg += `  • ${v.name}${attrs ? ` (${attrs})` : ''} — ${v.inStock ? '✅' : '❌'}\n`;
      }
    }

    msg += `\n¿Lo agregamos al pedido?`;
    return msg;
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private getPrimaryImage(images: string[] | null): string | null {
    if (!images || images.length === 0) return null;
    return images[0];
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string | null;
  inStock: boolean;
  stockAvailable: number;
}

export interface CatalogResponse {
  items: CatalogItem[];
  total: number;
  hasImages: boolean;
  formatted: string;
}

export interface ProductDetail {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  images: string[];
  inStock: boolean;
  stockAvailable: number;
}

export interface ProductDetailResponse {
  found: boolean;
  product: ProductDetail | null;
  variants: any[];
  formatted: string;
}
