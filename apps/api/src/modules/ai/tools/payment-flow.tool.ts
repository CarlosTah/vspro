import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Payment Flow Tool — End-to-end payment handling via conversation.
 *
 * Flow:
 * 1. confirm_order creates order → status: 'new'
 * 2. request_payment sends bank details → status: 'payment_pending'
 * 3. Client sends photo of transfer receipt
 * 4. verify_payment_image runs OCR → auto-verifies if amount matches
 * 5. Order transitions to 'paid' → triggers production
 *
 * Tools:
 * - request_payment: Sends bank transfer details to client
 * - verify_payment_image: OCR on receipt image, auto-verify
 * - check_payment_status: Check if payment was received
 */
@Injectable()
export class PaymentFlowTool {
  private readonly logger = new Logger(PaymentFlowTool.name);
  private readonly openai: OpenAI | null;
  private readonly AMOUNT_TOLERANCE = 2.0; // $2 MXN tolerance

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get('OPENAI_API_KEY');
    this.openai = key && !key.startsWith('sk-test') ? new OpenAI({ apiKey: key }) : null;
  }

  /**
   * Send payment instructions to the client.
   * Reads tenant's bank info and creates a payment record.
   */
  async requestPayment(
    args: { orderId: string },
    schemaName: string,
  ): Promise<PaymentRequestResult> {
    // Get order details
    const orders = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, order_number, total, status
      FROM "${schemaName}".orders WHERE id = $1::uuid
    `, args.orderId);

    if (!orders[0]) return { success: false, message: 'Pedido no encontrado' };

    const order = orders[0];
    if (order.status !== 'new') {
      return { success: false, message: `El pedido ya está en estado "${order.status}"` };
    }

    // Get tenant payment info from ai_config
    const config = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT agent_config->'payment_info' AS payment_info
      FROM "${schemaName}".ai_config LIMIT 1
    `);

    const paymentInfo = config[0]?.payment_info ?? this.getDefaultPaymentInfo();

    // Transition order to payment_pending
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".orders SET status = 'payment_pending', updated_at = NOW()
      WHERE id = $1::uuid
    `, args.orderId);

    // Create payment record
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO "${schemaName}".payments (order_id, method, amount, status, reference)
      VALUES ($1::uuid, 'transfer', $2, 'pending', $3)
    `, args.orderId, parseFloat(order.total), `REF-${order.order_number}`);

    // Format payment message
    const total = parseFloat(order.total);
    const message = this.formatPaymentInstructions(order.order_number, total, paymentInfo);

    this.logger.log(`[${schemaName}] Payment requested for ${order.order_number}: $${total}`);

    return { success: true, message, orderNumber: order.order_number, total };
  }

  /**
   * Verify a payment receipt image using GPT-4o Vision OCR.
   * Auto-verifies if extracted amount matches within tolerance.
   */
  async verifyPaymentImage(
    args: { orderId: string; imageUrl: string },
    schemaName: string,
  ): Promise<PaymentVerifyResult> {
    // Get expected amount
    const orders = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.id, o.order_number, o.total, o.status, p.id AS payment_id
      FROM "${schemaName}".orders o
      LEFT JOIN "${schemaName}".payments p ON p.order_id = o.id AND p.status = 'pending'
      WHERE o.id = $1::uuid
    `, args.orderId);

    if (!orders[0]) return { verified: false, message: 'Pedido no encontrado' };

    const order = orders[0];
    const expectedAmount = parseFloat(order.total);

    // Run OCR on image
    const ocrResult = await this.extractAmountFromImage(args.imageUrl);

    if (!ocrResult) {
      // OCR failed — save image for manual review
      if (order.payment_id) {
        await this.prisma.$executeRawUnsafe(`
          UPDATE "${schemaName}".payments SET proof_image_url = $1 WHERE id = $2::uuid
        `, args.imageUrl, order.payment_id);
      }
      return {
        verified: false,
        message: '📷 Recibí tu comprobante pero no pude leerlo automáticamente. Lo revisaremos manualmente y te confirmo pronto.',
        needsManualReview: true,
      };
    }

    // Compare amounts
    const discrepancy = Math.abs(ocrResult.amount - expectedAmount);

    if (discrepancy <= this.AMOUNT_TOLERANCE) {
      // Auto-verify!
      if (order.payment_id) {
        await this.prisma.$executeRawUnsafe(`
          UPDATE "${schemaName}".payments
          SET status = 'verified', proof_image_url = $1, ocr_data = $2::jsonb, verified_at = NOW()
          WHERE id = $3::uuid
        `, args.imageUrl, JSON.stringify(ocrResult), order.payment_id);
      }

      // Transition order to paid
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".orders SET status = 'paid', updated_at = NOW()
        WHERE id = $1::uuid
      `, args.orderId);

      this.logger.log(`[${schemaName}] Payment auto-verified for ${order.order_number}: $${ocrResult.amount} (expected $${expectedAmount})`);

      return {
        verified: true,
        message: `✅ *¡Pago confirmado!*\n\n💰 Monto: $${ocrResult.amount.toLocaleString()}\n📋 Pedido: ${order.order_number}\n🏦 Banco: ${ocrResult.bank ?? 'detectado'}\n\nTu pedido ya está en proceso. ¡Gracias! 🎉`,
        amount: ocrResult.amount,
        bank: ocrResult.bank,
      };
    }

    // Amount mismatch — flag for review
    if (order.payment_id) {
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".payments SET proof_image_url = $1, ocr_data = $2::jsonb, status = 'review'
        WHERE id = $3::uuid
      `, args.imageUrl, JSON.stringify({ ...ocrResult, expectedAmount, discrepancy }), order.payment_id);
    }

    return {
      verified: false,
      message: `⚠️ Recibí tu comprobante por $${ocrResult.amount.toLocaleString()}, pero el total del pedido es $${expectedAmount.toLocaleString()}. Lo revisaremos y te confirmo.`,
      amount: ocrResult.amount,
      expectedAmount,
      needsManualReview: true,
    };
  }

  /**
   * Check payment status for an order.
   */
  async checkPaymentStatus(
    args: { orderId?: string; orderNumber?: string },
    schemaName: string,
  ): Promise<string> {
    let whereClause: string;
    let param: string;

    if (args.orderId) {
      whereClause = 'o.id = $1::uuid';
      param = args.orderId;
    } else if (args.orderNumber) {
      whereClause = 'o.order_number = $1';
      param = args.orderNumber;
    } else {
      return JSON.stringify({ found: false, message: 'Necesito el número de pedido' });
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.order_number, o.status AS order_status, o.total,
             p.status AS payment_status, p.verified_at
      FROM "${schemaName}".orders o
      LEFT JOIN "${schemaName}".payments p ON p.order_id = o.id
      WHERE ${whereClause}
      ORDER BY p.created_at DESC LIMIT 1
    `, param);

    if (!rows[0]) return JSON.stringify({ found: false, message: 'Pedido no encontrado' });

    const r = rows[0];
    const statusMap: Record<string, string> = {
      pending: '⏳ Esperando comprobante',
      review: '🔍 En revisión manual',
      verified: '✅ Verificado',
      rejected: '❌ Rechazado',
    };

    return JSON.stringify({
      found: true,
      orderNumber: r.order_number,
      total: parseFloat(r.total),
      orderStatus: r.order_status,
      paymentStatus: statusMap[r.payment_status] ?? r.payment_status ?? 'Sin pago registrado',
    });
  }

  // ─── OCR via GPT-4o Vision ────────────────────────────────────

  private async extractAmountFromImage(imageUrl: string): Promise<OcrResult | null> {
    if (!this.openai) {
      this.logger.warn('OpenAI not available for OCR');
      return null;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Eres un sistema OCR para comprobantes de pago bancarios mexicanos.
Extrae SOLO el monto transferido y el banco emisor.
Responde ÚNICAMENTE con JSON: {"amount": number, "bank": "string", "confidence": 0.0-1.0}
Si no puedes leer el monto, responde: {"amount": null, "bank": null, "confidence": 0}`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extrae el monto de este comprobante de transferencia:' },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 100,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]);
      if (!parsed.amount || parsed.amount === null) return null;

      return { amount: parsed.amount, bank: parsed.bank, confidence: parsed.confidence ?? 0.5 };
    } catch (err: any) {
      this.logger.error(`OCR failed: ${err.message}`);
      return null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private formatPaymentInstructions(orderNumber: string, total: number, info: PaymentInfo): string {
    return `💳 *Datos para transferencia*\n\n` +
      `📋 Pedido: ${orderNumber}\n` +
      `💰 Total: *$${total.toLocaleString()} MXN*\n\n` +
      `🏦 Banco: ${info.bank}\n` +
      `📝 CLABE: ${info.clabe}\n` +
      `👤 Beneficiario: ${info.beneficiary}\n` +
      `🔢 Referencia: ${orderNumber}\n\n` +
      `📷 *Envía una foto de tu comprobante* y lo verifico automáticamente. ¡Gracias!`;
  }

  private getDefaultPaymentInfo(): PaymentInfo {
    return {
      bank: 'BBVA',
      clabe: '012180001234567890',
      beneficiary: 'VSPRO Demo SA de CV',
      reference_prefix: 'VS',
    };
  }
}

// ─── Types ──────────────────────────────────────────────────────

interface PaymentInfo {
  bank: string;
  clabe: string;
  beneficiary: string;
  reference_prefix?: string;
}

interface OcrResult {
  amount: number;
  bank: string | null;
  confidence: number;
}

interface PaymentRequestResult {
  success: boolean;
  message: string;
  orderNumber?: string;
  total?: number;
}

interface PaymentVerifyResult {
  verified: boolean;
  message: string;
  amount?: number;
  bank?: string | null;
  expectedAmount?: number;
  needsManualReview?: boolean;
}
