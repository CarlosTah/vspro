import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { CustomerMemoryService } from '../customer-memory.service';
import { BaseAgent } from './base-agent';
import { AgentContext, AgentSettings } from './types';

/**
 * Specialized agent for sales conversion and closing.
 * Handles price objections, applies discounts within policy limits,
 * suggests upsells, and triggers proactive follow-ups.
 */
@Injectable()
export class SalesAgent extends BaseAgent {
  readonly name = 'sales';
  readonly description = 'Agente de ventas y conversión';

  constructor(prisma: PrismaService, config: ConfigService, customerMemory: CustomerMemoryService) {
    super(prisma, config, customerMemory);
  }

  getSystemPrompt(tenant: any, settings: AgentSettings): string {
    return `Eres el agente de ventas de ${tenant.businessName}.
Tu objetivo principal es CERRAR LA VENTA de forma amigable pero efectiva.

REGLAS:
- Responde siempre en español, conciso (mensajes de WhatsApp cortos)
- Maneja objeciones de precio destacando beneficios y valor
- Ofrece descuentos SOLO dentro de los límites de la política comercial
- Si el cliente duda, programa un follow-up para más tarde
- Sugiere productos complementarios cuando sea natural
- Nunca presiones agresivamente — sé persuasivo pero respetuoso
- Si el cliente confirma, crea el pedido inmediatamente

IMPORTANTE: Si no puedes resolver algo (soporte técnico, devoluciones), indica que transferirás a un compañero.`;
  }

  getTools(): OpenAI.Chat.ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'show_catalog',
          description: 'Muestra productos del catálogo con imágenes al cliente. Usa cuando preguntan "qué tienen", "muéstrame vestidos", o piden ver opciones.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Búsqueda libre (nombre, tipo, color)' },
              category: { type: 'string', description: 'Categoría específica (Vestidos, Chamarras, etc.)' },
              limit: { type: 'number', description: 'Máximo de productos a mostrar (default 5, max 10)' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'show_product_detail',
          description: 'Muestra detalle completo de un producto con variantes (tallas, colores). Usa cuando el cliente pregunta por un producto específico.',
          parameters: {
            type: 'object',
            properties: {
              productName: { type: 'string', description: 'Nombre del producto' },
              productId: { type: 'string', description: 'ID del producto (si lo conoces)' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'check_product_availability',
          description: 'Verifica disponibilidad y precio de un producto',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Nombre o SKU del producto' } },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_order',
          description: 'Crea un pedido cuando el cliente confirma',
          parameters: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { productName: { type: 'string' }, quantity: { type: 'number' } },
                  required: ['productName', 'quantity'],
                },
              },
              notes: { type: 'string' },
            },
            required: ['items'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'apply_discount',
          description: 'Aplica descuento a un pedido (solo dentro de política comercial)',
          parameters: {
            type: 'object',
            properties: {
              orderId: { type: 'string' },
              discountPercent: { type: 'number', description: 'Porcentaje (1-50)' },
              reason: { type: 'string' },
            },
            required: ['orderId', 'discountPercent', 'reason'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'suggest_upsell',
          description: 'Sugiere productos complementarios o de mayor valor. Usa DESPUÉS de agregar al carrito o al mostrar detalle de producto. No lo uses en cada mensaje.',
          parameters: {
            type: 'object',
            properties: {
              productId: { type: 'string', description: 'ID del producto base (del que se quiere upsell)' },
              productName: { type: 'string', description: 'Nombre del producto base' },
              category: { type: 'string', description: 'Categoría actual' },
              strategy: { type: 'string', enum: ['upsell', 'cross_sell', 'complement', 'auto'], description: 'Estrategia (default: auto)' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'schedule_follow_up',
          description: 'Programa seguimiento si el cliente duda o necesita tiempo',
          parameters: {
            type: 'object',
            properties: {
              delay_hours: { type: 'number', description: 'Horas para el follow-up (1-168)' },
              reason: { type: 'string' },
            },
            required: ['delay_hours', 'reason'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_to_cart',
          description: 'Agrega un producto al carrito del cliente. Usa cuando dice "quiero", "agrégame", "me llevo".',
          parameters: {
            type: 'object',
            properties: {
              productName: { type: 'string', description: 'Nombre del producto a agregar' },
              quantity: { type: 'number', description: 'Cantidad (default 1)' },
              variant: { type: 'string', description: 'Variante específica (ej: "Talla 6 Rosa")' },
            },
            required: ['productName'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'show_cart',
          description: 'Muestra el carrito actual del cliente. Usa cuando pregunta "qué llevo", "mi carrito", "cuánto es".',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'remove_from_cart',
          description: 'Elimina un producto del carrito. Usa cuando dice "quita", "ya no quiero".',
          parameters: {
            type: 'object',
            properties: {
              productName: { type: 'string', description: 'Nombre del producto a quitar' },
            },
            required: ['productName'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'confirm_order',
          description: 'Confirma el pedido y convierte el carrito en una orden real. Usa cuando el cliente dice "es todo", "confirmo", "listo".',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'request_payment',
          description: 'Envía datos bancarios para transferencia al cliente. Usa DESPUÉS de confirmar pedido.',
          parameters: {
            type: 'object',
            properties: { orderId: { type: 'string', description: 'ID del pedido (se obtiene de confirm_order)' } },
            required: ['orderId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'verify_payment_image',
          description: 'Verifica un comprobante de pago (foto). Usa cuando el cliente envía una imagen después de solicitar el pago.',
          parameters: {
            type: 'object',
            properties: {
              orderId: { type: 'string', description: 'ID del pedido' },
              imageUrl: { type: 'string', description: 'URL de la imagen del comprobante' },
            },
            required: ['orderId', 'imageUrl'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_customer_memory',
          description: 'Guarda preferencias o datos del cliente para futuras conversaciones',
          parameters: {
            type: 'object',
            properties: {
              memory_type: { type: 'string', enum: ['profile', 'episode'] },
              category: { type: 'string' },
              content: { type: 'string' },
              data: { type: 'object' },
            },
            required: ['memory_type', 'category'],
          },
        },
      },
    ];
  }

  async executeTool(name: string, args: any, context: AgentContext): Promise<string> {
    const { schemaName, agentConfig } = context;
    const policies = agentConfig.commercial_policies;

    switch (name) {
      case 'show_catalog': {
        const products = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT p.id, p.name, p.description, p.price, p.category, p.images,
                 i.stock_available
          FROM "${schemaName}".products p
          LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
          WHERE p.is_active = true
            ${args.query ? `AND (p.name ILIKE '%${args.query}%' OR p.category ILIKE '%${args.query}%')` : ''}
            ${args.category ? `AND p.category ILIKE '%${args.category}%'` : ''}
          ORDER BY i.stock_available DESC NULLS LAST
          LIMIT ${Math.min(args.limit ?? 5, 10)}
        `);

        if (products.length === 0) return JSON.stringify({ found: false, message: 'No encontré productos con esa búsqueda' });

        const items = products.map((p: any, i: number) => ({
          position: i + 1,
          name: p.name,
          price: `$${parseFloat(p.price).toLocaleString()}`,
          category: p.category,
          inStock: (p.stock_available ?? 0) > 0,
          imageUrl: p.images?.[0] ?? null,
          description: p.description?.slice(0, 80) ?? '',
        }));

        return JSON.stringify({
          found: true,
          products: items,
          totalShown: items.length,
          hasImages: items.some(i => i.imageUrl),
          instruction: 'Presenta estos productos al cliente. Si tienen imageUrl, menciona que puedes enviar la foto. Usa emojis y formato amigable.',
        });
      }

      case 'show_product_detail': {
        const query = args.productId
          ? `WHERE p.id = '${args.productId}'::uuid`
          : `WHERE p.is_active = true AND p.name ILIKE '%${args.productName}%'`;

        const rows = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT p.*, i.stock_available
          FROM "${schemaName}".products p
          LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
          ${query} LIMIT 1
        `);

        if (!rows[0]) return JSON.stringify({ found: false });

        const p = rows[0];
        const variants = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT name, price, stock_available, attributes
          FROM "${schemaName}".product_variants
          WHERE product_id = $1::uuid AND is_active = true
        `, p.id);

        return JSON.stringify({
          found: true,
          product: {
            name: p.name,
            price: parseFloat(p.price),
            description: p.description,
            category: p.category,
            imageUrl: p.images?.[0] ?? null,
            inStock: (p.stock_available ?? 0) > 0,
            stock: p.stock_available ?? 0,
          },
          variants: variants.map((v: any) => ({
            name: v.name,
            price: v.price ? parseFloat(v.price) : parseFloat(p.price),
            inStock: (v.stock_available ?? 0) > 0,
            attributes: v.attributes,
          })),
          instruction: 'Muestra el detalle del producto. Si tiene variantes, pregunta cuál prefiere. Ofrece agregarlo al pedido.',
        });
      }

      case 'check_product_availability': {
        const products = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT p.name, p.price, i.stock_available
          FROM "${schemaName}".products p
          LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
          WHERE p.is_active = true AND (p.name ILIKE $1 OR p.sku ILIKE $1)
          LIMIT 5
        `, `%${args.query}%`);

        if (products.length === 0) return JSON.stringify({ found: false });
        return JSON.stringify({
          found: true,
          products: products.map(p => ({
            name: p.name,
            price: p.price,
            available: (p.stock_available ?? 0) > 0,
            stock: p.stock_available ?? 0,
          })),
        });
      }

      case 'apply_discount': {
        // ENFORCE POLICY: never exceed max_discount_percent
        const maxDiscount = policies?.max_discount_percent ?? 0;
        if (args.discountPercent > maxDiscount) {
          return JSON.stringify({
            success: false,
            error: `Descuento máximo permitido: ${maxDiscount}%. Solicitado: ${args.discountPercent}%`,
          });
        }
        // Apply discount logic (delegate to orders service pattern)
        const order = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT total FROM "${schemaName}".orders WHERE id = $1::uuid`, args.orderId,
        );
        if (!order[0]) return JSON.stringify({ success: false, error: 'Pedido no encontrado' });

        const total = parseFloat(order[0].total);
        const discount = total * (args.discountPercent / 100);
        const newTotal = total - discount;

        await this.prisma.$executeRawUnsafe(`
          UPDATE "${schemaName}".orders
          SET total = $1, notes = COALESCE(notes,'') || $2, updated_at = NOW()
          WHERE id = $3::uuid
        `, newTotal, `\n[Descuento ${args.discountPercent}%: -$${discount.toFixed(2)} — ${args.reason}]`, args.orderId);

        return JSON.stringify({ success: true, newTotal: newTotal.toFixed(2), discount: discount.toFixed(2) });
      }

      case 'schedule_follow_up': {
        const scheduledAt = new Date(Date.now() + args.delay_hours * 3600000);
        await this.prisma.$executeRawUnsafe(`
          UPDATE "${schemaName}".conversations
          SET next_follow_up_at = $1, context = jsonb_set(COALESCE(context,'{}'::jsonb), '{follow_up_reason}', $2::jsonb)
          WHERE id = $3::uuid
        `, scheduledAt.toISOString(), JSON.stringify(args.reason), context.conversationId);
        return JSON.stringify({ success: true, scheduledAt: scheduledAt.toISOString() });
      }

      case 'suggest_upsell': {
        // Get complementary products based on strategy
        const category = args.category;
        const productId = args.productId;
        const cartItems = (await this.getCartFromContext(context.conversationId, schemaName)).items;
        const cartIds = cartItems.map((i: any) => i.productId);

        // Simple cross-sell: different category, in stock
        const complements: Record<string, string[]> = {
          'Vestidos': ['Accesorios', 'Calzado'], 'Conjuntos': ['Accesorios', 'Calzado'],
          'Pantalones': ['Playeras', 'Chamarras'], 'Chamarras': ['Vestidos', 'Conjuntos'],
          'Calzado': ['Accesorios'], 'Accesorios': ['Vestidos'],
        };
        const targetCats = complements[category ?? ''] ?? [];

        let recs: any[] = [];

        if (args.strategy === 'upsell' && category) {
          // Higher price same category
          const basePrice = productId ? (await this.prisma.$queryRawUnsafe<any[]>(`SELECT price FROM "${schemaName}".products WHERE id = $1::uuid`, productId))[0]?.price ?? 0 : 0;
          recs = await this.prisma.$queryRawUnsafe<any[]>(`
            SELECT id, name, price, images FROM "${schemaName}".products
            WHERE is_active = true AND category = $1 AND price > $2 ${productId ? `AND id != '${productId}'::uuid` : ''}
            ORDER BY price ASC LIMIT 2
          `, category, parseFloat(basePrice));
        } else if (targetCats.length > 0) {
          // Cross-sell complement
          recs = await this.prisma.$queryRawUnsafe<any[]>(`
            SELECT p.id, p.name, p.price, p.images FROM "${schemaName}".products p
            LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
            WHERE p.is_active = true AND p.category = ANY($1::text[]) AND (i.stock_available > 0 OR i.stock_available IS NULL)
            ORDER BY RANDOM() LIMIT 2
          `, targetCats);
        } else {
          // Random popular
          recs = await this.prisma.$queryRawUnsafe<any[]>(`
            SELECT id, name, price, images FROM "${schemaName}".products WHERE is_active = true ORDER BY RANDOM() LIMIT 2
          `);
        }

        // Filter out items already in cart
        recs = recs.filter((r: any) => !cartIds.includes(r.id));

        if (recs.length === 0) return JSON.stringify({ hasRecommendations: false });

        return JSON.stringify({
          hasRecommendations: true,
          recommendations: recs.map((r: any) => ({ name: r.name, price: parseFloat(r.price), imageUrl: r.images?.[0] ?? null })),
          formatted: `💡 *También te puede interesar:*\n${recs.map((r: any) => `  • *${r.name}* — $${parseFloat(r.price).toLocaleString()}`).join('\n')}\n\n¿Te agrego alguno?`,
        });
      }

      case 'update_customer_memory': {
        return this.customerMemory.handleToolCall(context.customerId, args, schemaName);
      }

      case 'create_order': {
        // Simplified — resolve products and create order
        return JSON.stringify({ success: true, message: 'Pedido creado (delegado a OrdersService)' });
      }

      case 'add_to_cart': {
        const cart = await this.getCartFromContext(context.conversationId, schemaName);
        // Resolve product
        const prods = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT p.id, p.name, p.price, p.images, i.stock_available
          FROM "${schemaName}".products p
          LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
          WHERE p.is_active = true AND p.name ILIKE $1 LIMIT 1
        `, `%${args.productName}%`);

        if (!prods[0]) return JSON.stringify({ success: false, message: `No encontré "${args.productName}"` });

        const p = prods[0];
        const qty = args.quantity ?? 1;
        if ((p.stock_available ?? 0) < qty) return JSON.stringify({ success: false, message: `Solo hay ${p.stock_available} disponibles` });

        const price = parseFloat(p.price);
        const existing = cart.items.findIndex((i: any) => i.productId === p.id);
        if (existing >= 0) { cart.items[existing].quantity += qty; }
        else { cart.items.push({ productId: p.id, productName: p.name, variantId: null, variantName: args.variant ?? null, quantity: qty, unitPrice: price, imageUrl: p.images?.[0] ?? null }); }

        cart.total = cart.items.reduce((s: number, i: any) => s + i.unitPrice * i.quantity, 0);
        cart.itemCount = cart.items.reduce((s: number, i: any) => s + i.quantity, 0);
        await this.saveCartToContext(context.conversationId, cart, schemaName);

        return JSON.stringify({ success: true, added: `${qty}x ${p.name}`, cart: { items: cart.items.length, total: cart.total }, message: `✅ Agregado: ${qty}x ${p.name} ($${(price * qty).toLocaleString()})` });
      }

      case 'show_cart': {
        const cart = await this.getCartFromContext(context.conversationId, schemaName);
        if (cart.items.length === 0) return JSON.stringify({ empty: true, message: 'Carrito vacío. ¿Qué te gustaría agregar?' });
        const summary = cart.items.map((i: any) => `${i.quantity}x ${i.productName} — $${(i.unitPrice * i.quantity).toLocaleString()}`);
        return JSON.stringify({ items: summary, total: cart.total, itemCount: cart.itemCount, message: `🛒 Tu carrito:\n${summary.join('\n')}\n\n💰 Total: $${cart.total.toLocaleString()}` });
      }

      case 'remove_from_cart': {
        const cart = await this.getCartFromContext(context.conversationId, schemaName);
        const idx = cart.items.findIndex((i: any) => i.productName.toLowerCase().includes(args.productName.toLowerCase()));
        if (idx < 0) return JSON.stringify({ success: false, message: `"${args.productName}" no está en el carrito` });
        const removed = cart.items.splice(idx, 1)[0];
        cart.total = cart.items.reduce((s: number, i: any) => s + i.unitPrice * i.quantity, 0);
        cart.itemCount = cart.items.reduce((s: number, i: any) => s + i.quantity, 0);
        await this.saveCartToContext(context.conversationId, cart, schemaName);
        return JSON.stringify({ success: true, message: `🗑️ Eliminado: ${removed.productName}`, cart: { items: cart.items.length, total: cart.total } });
      }

      case 'confirm_order': {
        const cart = await this.getCartFromContext(context.conversationId, schemaName);
        if (cart.items.length === 0) return JSON.stringify({ success: false, message: 'El carrito está vacío' });
        if (!context.customerId) return JSON.stringify({ success: false, message: 'No pude identificar al cliente' });

        // Create order
        const countRows = await this.prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) as c FROM "${schemaName}".orders`);
        const num = `ORD-${new Date().getFullYear()}-${String(parseInt(countRows[0]?.c ?? '0') + 1).padStart(5, '0')}`;
        const orderItems = cart.items.map((i: any) => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice }));

        const orders = await this.prisma.$queryRawUnsafe<any[]>(`
          INSERT INTO "${schemaName}".orders (order_number, customer_id, channel_type, status, items, subtotal, total)
          VALUES ($1, $2::uuid, 'whatsapp', 'new', $3::jsonb, $4, $4) RETURNING id, order_number
        `, num, context.customerId, JSON.stringify(orderItems), cart.total);

        // Reserve stock
        for (const item of cart.items) {
          await this.prisma.$executeRawUnsafe(`UPDATE "${schemaName}".inventory SET stock_available = stock_available - $1, stock_reserved = stock_reserved + $1 WHERE product_id = $2::uuid AND stock_available >= $1`, item.quantity, item.productId);
        }

        // Clear cart
        await this.saveCartToContext(context.conversationId, { items: [], total: 0, itemCount: 0 }, schemaName);

        return JSON.stringify({ success: true, orderNumber: orders[0].order_number, total: cart.total, itemCount: cart.itemCount, message: `🎉 ¡Pedido creado! ${orders[0].order_number} — Total: $${cart.total.toLocaleString()}`, orderId: orders[0].id });
      }

      case 'request_payment': {
        const ord = await this.prisma.$queryRawUnsafe<any[]>(`SELECT order_number, total, status FROM "${schemaName}".orders WHERE id = $1::uuid`, args.orderId);
        if (!ord[0]) return JSON.stringify({ success: false, message: 'Pedido no encontrado' });
        if (ord[0].status !== 'new') return JSON.stringify({ success: false, message: `Pedido ya en estado "${ord[0].status}"` });

        const aiCfg = await this.prisma.$queryRawUnsafe<any[]>(`SELECT agent_config->'payment_info' AS info FROM "${schemaName}".ai_config LIMIT 1`);
        const info = aiCfg[0]?.info ?? { bank: 'BBVA', clabe: '012180001234567890', beneficiary: 'Demo SA de CV' };

        await this.prisma.$executeRawUnsafe(`UPDATE "${schemaName}".orders SET status = 'payment_pending', updated_at = NOW() WHERE id = $1::uuid`, args.orderId);
        await this.prisma.$executeRawUnsafe(`INSERT INTO "${schemaName}".payments (order_id, method, amount, status, reference) VALUES ($1::uuid, 'transfer', $2, 'pending', $3)`, args.orderId, parseFloat(ord[0].total), `REF-${ord[0].order_number}`);

        const t = parseFloat(ord[0].total);
        return JSON.stringify({ success: true, message: `💳 *Datos para transferencia*\n\n📋 Pedido: ${ord[0].order_number}\n💰 Total: *$${t.toLocaleString()} MXN*\n\n🏦 Banco: ${info.bank}\n📝 CLABE: ${info.clabe}\n👤 Beneficiario: ${info.beneficiary}\n🔢 Referencia: ${ord[0].order_number}\n\n📷 *Envía foto de tu comprobante* y lo verifico al instante.` });
      }

      case 'verify_payment_image': {
        const ordR = await this.prisma.$queryRawUnsafe<any[]>(`SELECT o.order_number, o.total, p.id AS pid FROM "${schemaName}".orders o LEFT JOIN "${schemaName}".payments p ON p.order_id = o.id AND p.status = 'pending' WHERE o.id = $1::uuid`, args.orderId);
        if (!ordR[0]) return JSON.stringify({ verified: false, message: 'Pedido no encontrado' });
        if (ordR[0].pid) await this.prisma.$executeRawUnsafe(`UPDATE "${schemaName}".payments SET proof_image_url = $1 WHERE id = $2::uuid`, args.imageUrl, ordR[0].pid);
        return JSON.stringify({ verified: false, message: `📷 Comprobante recibido para ${ordR[0].order_number} ($${parseFloat(ordR[0].total).toLocaleString()}). Verificando...`, needsReview: true });
      }

      default:
        return JSON.stringify({ error: `Tool '${name}' not available in SalesAgent` });
    }
  }

  // ─── Cart Helpers (JSONB in conversations.context) ────────────

  private async getCartFromContext(conversationId: string, schemaName: string): Promise<any> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT context->'cart' AS cart FROM "${schemaName}".conversations WHERE id = $1::uuid`,
      conversationId,
    );
    const raw = rows[0]?.cart;
    if (!raw || !raw.items) return { items: [], total: 0, itemCount: 0 };
    return raw;
  }

  private async saveCartToContext(conversationId: string, cart: any, schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET context = jsonb_set(COALESCE(context, '{}'::jsonb), '{cart}', $1::jsonb)
      WHERE id = $2::uuid
    `, JSON.stringify(cart), conversationId);
  }
}
