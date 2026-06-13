import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Redis from 'ioredis';
import { AgentType, AgentConfig, RouteResult } from './types';

/**
 * Routes incoming messages to the appropriate specialized agent.
 * Uses heuristic-first classification with LLM fallback.
 * Caches intent per conversation in Redis (TTL 30min).
 */
@Injectable()
export class AgentRouterService {
  private readonly logger = new Logger(AgentRouterService.name);
  private readonly openai: OpenAI;
  private readonly redis: Redis | null;
  private readonly CACHE_TTL = 1800; // 30 minutes

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') });

    // Connect to Redis for intent caching
    try {
      this.redis = new Redis({
        host: this.config.get('REDIS_HOST', 'localhost'),
        port: this.config.get<number>('REDIS_PORT', 6380),
        password: this.config.get('REDIS_PASSWORD'),
        maxRetriesPerRequest: 1,
      });
    } catch {
      this.logger.warn('Redis unavailable for intent cache — routing without cache');
      this.redis = null;
    }
  }

  async route(
    message: string,
    conversationContext: any,
    agentConfig: AgentConfig,
  ): Promise<RouteResult> {
    const conversationId = conversationContext?.id;

    // 1. Check Redis cache
    if (conversationId) {
      const cached = await this.getCachedIntent(conversationId);
      if (cached) return cached;
    }

    // 2. Heuristic classification
    const heuristic = this.classifyHeuristic(message, conversationContext);
    if (heuristic.confidence >= 0.7 && this.isAgentEnabled(heuristic.agent, agentConfig)) {
      const result: RouteResult = { ...heuristic, source: 'heuristic' };
      if (conversationId) await this.cacheIntent(conversationId, result);
      return result;
    }

    // 3. LLM fallback
    const llmResult = await this.classifyLLM(message);
    if (llmResult.confidence >= 0.7 && this.isAgentEnabled(llmResult.agent, agentConfig)) {
      const result: RouteResult = { ...llmResult, source: 'llm' };
      if (conversationId) await this.cacheIntent(conversationId, result);
      return result;
    }

    // 4. Default to general
    return { agent: 'general', confidence: llmResult.confidence, source: 'llm' };
  }

  // ─── Heuristic Classification ─────────────────────────────────

  classifyHeuristic(message: string, context: any): { agent: AgentType; confidence: number } {
    const lower = message.toLowerCase();
    const orderState = context?.orderState ?? context?.context?.orderState;

    // Sales signals
    if (/precio|caro|descuento|promoción|comprar|pedir|ordenar|cuánto cuesta|quiero|me interesa/i.test(lower)) {
      return { agent: 'sales', confidence: 0.85 };
    }
    if (orderState === 'payment_pending' || orderState === 'new') {
      return { agent: 'sales', confidence: 0.8 };
    }

    // Finance signals
    if (/pago|transferencia|comprobante|factura|cobro|deposité|pagué/i.test(lower)) {
      return { agent: 'finance', confidence: 0.8 };
    }

    // Support signals
    if (/problema|error|queja|devolver|cambio|ayuda|no funciona|reclamo/i.test(lower)) {
      return { agent: 'support', confidence: 0.75 };
    }

    // Inventory (rarely triggered by customer messages)
    if (/stock|inventario|disponible|hay en existencia/i.test(lower)) {
      return { agent: 'sales', confidence: 0.7 }; // Stock questions are sales context
    }

    return { agent: 'general', confidence: 0.4 };
  }

  // ─── LLM Classification ───────────────────────────────────────

  private async classifyLLM(message: string): Promise<{ agent: AgentType; confidence: number }> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Clasifica la intención del mensaje en UNA categoría:
- sales: comprar, precio, descuento, pedido, producto
- finance: pago, transferencia, comprobante, factura
- support: problema, queja, devolución, ayuda
- general: saludo, pregunta general, no clasificable
Responde SOLO JSON: {"intent":"categoria","confidence":0.0-1.0}`,
          },
          { role: 'user', content: message },
        ],
        temperature: 0,
        max_tokens: 50,
      });

      const parsed = JSON.parse(response.choices[0].message.content ?? '{}');
      return {
        agent: (parsed.intent as AgentType) ?? 'general',
        confidence: parsed.confidence ?? 0.5,
      };
    } catch (err) {
      this.logger.error('LLM classification failed:', err);
      return { agent: 'general', confidence: 0.3 };
    }
  }

  // ─── Redis Cache ──────────────────────────────────────────────

  private async getCachedIntent(conversationId: string): Promise<RouteResult | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(`intent:${conversationId}`);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return { agent: data.agent, confidence: data.confidence, source: 'cache' };
    } catch {
      return null;
    }
  }

  private async cacheIntent(conversationId: string, result: RouteResult): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.setex(
        `intent:${conversationId}`,
        this.CACHE_TTL,
        JSON.stringify({ agent: result.agent, confidence: result.confidence }),
      );
    } catch { /* ignore cache failures */ }
  }

  async invalidateCache(conversationId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(`intent:${conversationId}`);
    } catch { /* ignore */ }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private isAgentEnabled(agent: AgentType, config: AgentConfig): boolean {
    return config.agents[agent]?.enabled !== false;
  }
}
