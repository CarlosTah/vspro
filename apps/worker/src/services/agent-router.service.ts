import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type AgentType = 'sales' | 'inventory' | 'finance' | 'support' | 'general';

interface RouteResult {
  agent: AgentType;
  confidence: number;
  source: 'heuristic' | 'cache';
}

/**
 * Lightweight AgentRouterService for the worker process.
 * Uses heuristic-only classification (no LLM calls in worker to save cost).
 */
@Injectable()
export class AgentRouterService {
  private readonly logger = new Logger(AgentRouterService.name);

  constructor(private readonly config: ConfigService) {}

  async route(message: string, context: any, agentConfig: any): Promise<RouteResult> {
    const result = this.classifyHeuristic(message, context);

    // Check if agent is enabled
    if (agentConfig?.agents?.[result.agent]?.enabled === false) {
      return { agent: 'general', confidence: result.confidence, source: 'heuristic' };
    }

    return { ...result, source: 'heuristic' };
  }

  private classifyHeuristic(message: string, context: any): { agent: AgentType; confidence: number } {
    const lower = (message ?? '').toLowerCase();
    const orderState = context?.orderState;

    if (/precio|caro|descuento|comprar|pedir|ordenar|cuánto cuesta|quiero|me interesa/i.test(lower)) {
      return { agent: 'sales', confidence: 0.85 };
    }
    if (orderState === 'payment_pending' || orderState === 'new') {
      return { agent: 'sales', confidence: 0.8 };
    }
    if (/pago|transferencia|comprobante|factura|cobro|deposité/i.test(lower)) {
      return { agent: 'finance', confidence: 0.8 };
    }
    if (/problema|error|queja|devolver|cambio|ayuda|no funciona/i.test(lower)) {
      return { agent: 'support', confidence: 0.75 };
    }

    return { agent: 'general', confidence: 0.4 };
  }
}
