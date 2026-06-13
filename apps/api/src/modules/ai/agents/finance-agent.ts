import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { CustomerMemoryService } from '../customer-memory.service';
import { BaseAgent } from './base-agent';
import { AgentContext, AgentSettings, ReconciliationResult } from './types';

/**
 * Finance reconciliation agent.
 * Matches OCR-verified payments against Stripe webhook events.
 * Auto-resolves discrepancies within tolerance, escalates larger ones.
 *
 * Triggered by: Stripe webhooks + daily cron reconciliation pass.
 */
@Injectable()
export class FinanceAgent extends BaseAgent {
  readonly name = 'finance';
  readonly description = 'Agente de conciliación financiera';

  private readonly DEFAULT_TOLERANCE = 5.0; // $5 MXN

  constructor(prisma: PrismaService, config: ConfigService, customerMemory: CustomerMemoryService) {
    super(prisma, config, customerMemory);
  }

  getSystemPrompt(tenant: any, _settings: AgentSettings): string {
    return `Eres el agente financiero de ${tenant.businessName}.
Ayudas con consultas sobre pagos, comprobantes y facturación.
Responde en español, conciso. Si el cliente envía un comprobante, confirma que lo revisarás.`;
  }

  getTools(): OpenAI.Chat.ChatCompletionTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'check_payment_status',
          description: 'Verifica el estado de pago de un pedido',
          parameters: {
            type: 'object',
            properties: { orderNumber: { type: 'string' } },
            required: ['orderNumber'],
          },
        },
      },
    ];
  }

  async executeTool(name: string, args: any, context: AgentContext): Promise<string> {
    if (name === 'check_payment_status') {
      const payments = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT p.amount, p.status, p.method, p.created_at
        FROM "${context.schemaName}".payments p
        JOIN "${context.schemaName}".orders o ON o.id = p.order_id
        WHERE o.order_number = $1
        ORDER BY p.created_at DESC LIMIT 1
      `, args.orderNumber);

      if (!payments[0]) return JSON.stringify({ found: false });
      return JSON.stringify({ found: true, ...payments[0] });
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  // ─── Reconciliation Logic (event-driven) ──────────────────────

  /**
   * Match a Stripe charge event against existing payments.
   * Called when a Stripe webhook (charge.succeeded) is received.
   */
  async reconcileStripeEvent(
    event: { amount: number; reference: string; stripeId: string },
    schemaName: string,
    tolerance?: number,
  ): Promise<ReconciliationResult> {
    const tol = tolerance ?? this.DEFAULT_TOLERANCE;

    // Find payment by order reference
    const payments = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.amount, p.status, o.order_number
      FROM "${schemaName}".payments p
      JOIN "${schemaName}".orders o ON o.id = p.order_id
      WHERE o.order_number = $1
        AND p.status IN ('pending', 'verified')
      ORDER BY p.created_at DESC LIMIT 1
    `, event.reference);

    if (!payments[0]) {
      this.logger.warn(`No matching payment for Stripe event ${event.stripeId} (ref: ${event.reference})`);
      return { status: 'no_match', stripeEventId: event.stripeId };
    }

    const payment = payments[0];
    const expectedAmount = parseFloat(payment.amount);
    const receivedAmount = event.amount;
    const discrepancy = Math.abs(expectedAmount - receivedAmount);

    if (discrepancy <= tol) {
      // Auto-reconcile
      const note = discrepancy > 0
        ? `Auto-reconciliado: discrepancia $${discrepancy.toFixed(2)} dentro de tolerancia`
        : 'Reconciliado: montos coinciden exactamente';

      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".payments
        SET status = 'reconciled', reference = COALESCE(reference,'') || $1
        WHERE id = $2::uuid
      `, `\n[${note}] Stripe: ${event.stripeId}`, payment.id);

      this.logger.log(`Auto-reconciled payment ${payment.id}: discrepancy $${discrepancy.toFixed(2)}`);

      return {
        status: 'auto_reconciled',
        discrepancy,
        note,
        paymentId: payment.id,
        stripeEventId: event.stripeId,
      };
    }

    // Escalate
    this.logger.warn(
      `Discrepancy exceeds tolerance for payment ${payment.id}: expected $${expectedAmount}, received $${receivedAmount} (diff: $${discrepancy.toFixed(2)})`,
    );

    return {
      status: 'escalated',
      discrepancy,
      note: `Discrepancia $${discrepancy.toFixed(2)} excede tolerancia de $${tol}. Requiere revisión manual.`,
      paymentId: payment.id,
      stripeEventId: event.stripeId,
    };
  }

  // ─── Daily Reconciliation Cron ────────────────────────────────

  /**
   * Daily pass: find payments older than 24h without reconciliation.
   */
  async dailyReconciliation(schemaName: string): Promise<void> {
    const stalePayments = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.amount, p.status, o.order_number
      FROM "${schemaName}".payments p
      JOIN "${schemaName}".orders o ON o.id = p.order_id
      WHERE p.status = 'verified'
        AND p.created_at < NOW() - INTERVAL '24 hours'
      ORDER BY p.created_at ASC
      LIMIT 50
    `);

    if (stalePayments.length > 0) {
      this.logger.warn(
        `[${schemaName}] ${stalePayments.length} verified payments older than 24h without reconciliation`,
      );
    }
  }
}
