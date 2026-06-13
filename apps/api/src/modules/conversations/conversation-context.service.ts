import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Manages conversation context state using JSONB persistence.
 * Provides transactional read/write/merge operations on the
 * `context` and `agent_context` JSONB columns.
 *
 * Strategy: JSONB Memory — all state is persisted in PostgreSQL JSONB,
 * enabling full reconstruction of conversation state without Redis.
 *
 * Context structure:
 * - context: Business state (customerId, orderId, orderState, cart items)
 * - agent_context: Agent routing state (lastAgent, confidence, toolsExecuted)
 */
@Injectable()
export class ConversationContextService {
  private readonly logger = new Logger(ConversationContextService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Read Operations ──────────────────────────────────────────

  /**
   * Get the full context (business + agent) for a conversation.
   */
  async getContext(conversationId: string, schemaName: string): Promise<ConversationState> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT context, agent_context AS "agentContext",
             status, customer_id AS "customerId",
             last_message_at AS "lastMessageAt"
      FROM "${schemaName}".conversations
      WHERE id = $1::uuid
    `, conversationId);

    if (!rows[0]) {
      return { context: {}, agentContext: {}, status: 'unknown', customerId: null };
    }

    return {
      context: rows[0].context ?? {},
      agentContext: rows[0].agentContext ?? {},
      status: rows[0].status,
      customerId: rows[0].customerId,
      lastMessageAt: rows[0].lastMessageAt,
    };
  }

  /**
   * Get a specific key from the business context.
   */
  async getContextKey<T = any>(
    conversationId: string,
    key: string,
    schemaName: string,
  ): Promise<T | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT context->$2 AS value
      FROM "${schemaName}".conversations
      WHERE id = $1::uuid
    `, conversationId, key);

    return rows[0]?.value ?? null;
  }

  // ─── Write Operations ─────────────────────────────────────────

  /**
   * Set a specific key in the business context (deep merge).
   */
  async setContextKey(
    conversationId: string,
    key: string,
    value: any,
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET context = jsonb_set(
        COALESCE(context, '{}'::jsonb),
        ARRAY[$2::text],
        $3::jsonb
      )
      WHERE id = $1::uuid
    `, conversationId, key, JSON.stringify(value));
  }

  /**
   * Merge multiple keys into the business context at once.
   */
  async mergeContext(
    conversationId: string,
    data: Record<string, any>,
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET context = COALESCE(context, '{}'::jsonb) || $2::jsonb
      WHERE id = $1::uuid
    `, conversationId, JSON.stringify(data));
  }

  /**
   * Update the agent context (routing state, last agent, tools executed).
   */
  async setAgentContext(
    conversationId: string,
    agentData: AgentContextData,
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET agent_context = $2::jsonb
      WHERE id = $1::uuid
    `, conversationId, JSON.stringify(agentData));
  }

  /**
   * Merge into agent context without overwriting existing keys.
   */
  async mergeAgentContext(
    conversationId: string,
    data: Partial<AgentContextData>,
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET agent_context = COALESCE(agent_context, '{}'::jsonb) || $2::jsonb
      WHERE id = $1::uuid
    `, conversationId, JSON.stringify(data));
  }

  // ─── State Transitions ────────────────────────────────────────

  /**
   * Track order state in conversation context.
   * Called when an order transitions to a new state.
   */
  async trackOrderState(
    conversationId: string,
    orderId: string,
    orderState: string,
    schemaName: string,
  ): Promise<void> {
    await this.mergeContext(conversationId, {
      orderId,
      orderState,
      orderStateUpdatedAt: new Date().toISOString(),
    }, schemaName);

    this.logger.debug(`[${schemaName}] Conv ${conversationId}: order ${orderId} → ${orderState}`);
  }

  /**
   * Track cart items in conversation context.
   * Used by SalesAgent to maintain cart state across messages.
   */
  async updateCart(
    conversationId: string,
    cartItems: CartItem[],
    schemaName: string,
  ): Promise<void> {
    await this.setContextKey(conversationId, 'cart', {
      items: cartItems,
      updatedAt: new Date().toISOString(),
      total: cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }, schemaName);
  }

  /**
   * Clear the cart (after order creation or abandonment).
   */
  async clearCart(conversationId: string, schemaName: string): Promise<void> {
    await this.setContextKey(conversationId, 'cart', null, schemaName);
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  /**
   * Reset all context for a conversation (on resolution).
   */
  async resetContext(conversationId: string, schemaName: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET context = '{}'::jsonb, agent_context = '{}'::jsonb
      WHERE id = $1::uuid
    `, conversationId);
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface ConversationState {
  context: Record<string, any>;
  agentContext: Record<string, any>;
  status: string;
  customerId: string | null;
  lastMessageAt?: Date;
}

export interface AgentContextData {
  lastAgent?: string;
  lastConfidence?: number;
  lastSource?: string;
  toolsExecuted?: string[];
  routedAt?: string;
}

export interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  variantId?: string;
}
