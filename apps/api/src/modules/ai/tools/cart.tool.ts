import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Conversational Cart Tool — Maintains a shopping cart within the conversation JSONB.
 *
 * The cart lives in conversations.context.cart and persists across messages.
 * The AI uses these tools to build orders interactively:
 *
 * Tools:
 * - add_to_cart: Add a product (resolves by name, validates stock)
 * - remove_from_cart: Remove an item
 * - show_cart: Display current cart summary
 * - clear_cart: Empty the cart
 * - confirm_order: Convert cart into a real order
 */
@Injectable()
export class CartTool {
  private readonly logger = new Logger(CartTool.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add a product to the cart. Resolves product by name, validates stock.
   */
  async addToCart(
    args: { productName: string; quantity?: number; variant?: string },
    conversationId: string,
    schemaName: string,
  ): Promise<CartActionResult> {
    const quantity = args.quantity ?? 1;

    // Resolve product
    const products = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.name, p.price, p.images, i.stock_available
      FROM "${schemaName}".products p
      LEFT JOIN "${schemaName}".inventory i ON i.product_id = p.id
      WHERE p.is_active = true AND p.name ILIKE $1
      LIMIT 1
    `, `%${args.productName}%`);

    if (!products[0]) {
      return { success: false, message: `No encontré "${args.productName}" en el catálogo.`, cart: await this.getCart(conversationId, schemaName) };
    }

    const product = products[0];
    const stock = product.stock_available ?? 0;

    if (stock < quantity) {
      return { success: false, message: `Solo hay ${stock} disponibles de "${product.name}".`, cart: await this.getCart(conversationId, schemaName) };
    }

    // Resolve variant if specified
    let variantId: string | null = null;
    let variantName: string | null = null;
    let finalPrice = parseFloat(product.price);

    if (args.variant) {
      const variants = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT id, name, price, stock_available FROM "${schemaName}".product_variants
        WHERE product_id = $1::uuid AND is_active = true AND name ILIKE $2
        LIMIT 1
      `, product.id, `%${args.variant}%`);

      if (variants[0]) {
        variantId = variants[0].id;
        variantName = variants[0].name;
        if (variants[0].price) finalPrice = parseFloat(variants[0].price);
        if ((variants[0].stock_available ?? 0) < quantity) {
          return { success: false, message: `La variante "${variantName}" solo tiene ${variants[0].stock_available} en stock.`, cart: await this.getCart(conversationId, schemaName) };
        }
      }
    }

    // Load current cart
    const cart = await this.getCart(conversationId, schemaName);

    // Check if item already in cart (update quantity)
    const existingIndex = cart.items.findIndex(
      (item) => item.productId === product.id && item.variantId === (variantId ?? null),
    );

    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity += quantity;
    } else {
      cart.items.push({
        productId: product.id,
        productName: product.name,
        variantId,
        variantName,
        quantity,
        unitPrice: finalPrice,
        imageUrl: product.images?.[0] ?? null,
      });
    }

    // Recalculate total
    cart.total = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    cart.itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cart.updatedAt = new Date().toISOString();

    // Save cart
    await this.saveCart(conversationId, cart, schemaName);

    return {
      success: true,
      message: `✅ Agregado: ${quantity}x ${product.name}${variantName ? ` (${variantName})` : ''} — $${(finalPrice * quantity).toLocaleString()}`,
      cart,
    };
  }

  /**
   * Remove an item from the cart.
   */
  async removeFromCart(
    args: { productName: string },
    conversationId: string,
    schemaName: string,
  ): Promise<CartActionResult> {
    const cart = await this.getCart(conversationId, schemaName);

    const index = cart.items.findIndex(
      (item) => item.productName.toLowerCase().includes(args.productName.toLowerCase()),
    );

    if (index < 0) {
      return { success: false, message: `"${args.productName}" no está en tu carrito.`, cart };
    }

    const removed = cart.items.splice(index, 1)[0];
    cart.total = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    cart.itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    cart.updatedAt = new Date().toISOString();

    await this.saveCart(conversationId, cart, schemaName);

    return {
      success: true,
      message: `🗑️ Eliminado: ${removed.productName}`,
      cart,
    };
  }

  /**
   * Show the current cart.
   */
  async showCart(
    conversationId: string,
    schemaName: string,
  ): Promise<CartActionResult> {
    const cart = await this.getCart(conversationId, schemaName);

    if (cart.items.length === 0) {
      return { success: true, message: 'Tu carrito está vacío. ¿Qué te gustaría agregar?', cart };
    }

    return { success: true, message: this.formatCart(cart), cart };
  }

  /**
   * Clear the entire cart.
   */
  async clearCart(
    conversationId: string,
    schemaName: string,
  ): Promise<CartActionResult> {
    const emptyCart: Cart = { items: [], total: 0, itemCount: 0, updatedAt: new Date().toISOString() };
    await this.saveCart(conversationId, emptyCart, schemaName);
    return { success: true, message: '🗑️ Carrito vaciado.', cart: emptyCart };
  }

  /**
   * Convert the cart into a real order.
   */
  async confirmOrder(
    conversationId: string,
    customerId: string | null,
    schemaName: string,
  ): Promise<OrderConfirmResult> {
    if (!customerId) {
      return { success: false, message: 'No pude identificar al cliente para crear el pedido.', orderId: null, orderNumber: null };
    }

    const cart = await this.getCart(conversationId, schemaName);

    if (cart.items.length === 0) {
      return { success: false, message: 'El carrito está vacío. Agrega productos primero.', orderId: null, orderNumber: null };
    }

    // Generate order number
    const countRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as c FROM "${schemaName}".orders`,
    );
    const count = parseInt(countRows[0]?.c ?? '0') + 1;
    const orderNumber = `ORD-${new Date().getFullYear()}-${String(count).padStart(5, '0')}`;

    // Create order
    const orderItems = cart.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      variantId: item.variantId,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));

    const orders = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".orders
        (order_number, customer_id, channel_type, status, items, subtotal, total)
      VALUES ($1, $2::uuid, 'whatsapp', 'new', $3::jsonb, $4, $4)
      RETURNING id, order_number
    `, orderNumber, customerId, JSON.stringify(orderItems), cart.total);

    // Reserve stock
    for (const item of cart.items) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".inventory
        SET stock_available = stock_available - $1,
            stock_reserved = stock_reserved + $1,
            updated_at = NOW()
        WHERE product_id = $2::uuid AND stock_available >= $1
      `, item.quantity, item.productId);
    }

    // Clear cart
    const emptyCart: Cart = { items: [], total: 0, itemCount: 0, updatedAt: new Date().toISOString() };
    await this.saveCart(conversationId, emptyCart, schemaName);

    this.logger.log(`[${schemaName}] Order ${orderNumber} created from cart (${cart.items.length} items, $${cart.total})`);

    return {
      success: true,
      message: `🎉 ¡Pedido creado!\n\n📋 *${orders[0].order_number}*\n💰 Total: $${cart.total.toLocaleString()}\n📦 ${cart.itemCount} artículo(s)`,
      orderId: orders[0].id,
      orderNumber: orders[0].order_number,
    };
  }

  // ─── Cart Persistence (JSONB in conversations.context) ────────

  private async getCart(conversationId: string, schemaName: string): Promise<Cart> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT context->'cart' AS cart FROM "${schemaName}".conversations WHERE id = $1::uuid`,
      conversationId,
    );

    const raw = rows[0]?.cart;
    if (!raw || !raw.items) return { items: [], total: 0, itemCount: 0, updatedAt: new Date().toISOString() };
    return raw as Cart;
  }

  private async saveCart(conversationId: string, cart: Cart, schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET context = jsonb_set(COALESCE(context, '{}'::jsonb), '{cart}', $1::jsonb)
      WHERE id = $2::uuid
    `, JSON.stringify(cart), conversationId);
  }

  // ─── Formatting ───────────────────────────────────────────────

  private formatCart(cart: Cart): string {
    let msg = `🛒 *Tu carrito*\n\n`;
    for (const item of cart.items) {
      const variant = item.variantName ? ` (${item.variantName})` : '';
      msg += `• ${item.quantity}x ${item.productName}${variant} — $${(item.unitPrice * item.quantity).toLocaleString()}\n`;
    }
    msg += `\n💰 *Total: $${cart.total.toLocaleString()}*`;
    msg += `\n\n¿Confirmamos el pedido o quieres agregar algo más?`;
    return msg;
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface CartItem {
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  imageUrl: string | null;
}

export interface Cart {
  items: CartItem[];
  total: number;
  itemCount: number;
  updatedAt: string;
}

export interface CartActionResult {
  success: boolean;
  message: string;
  cart: Cart;
}

export interface OrderConfirmResult {
  success: boolean;
  message: string;
  orderId: string | null;
  orderNumber: string | null;
}
