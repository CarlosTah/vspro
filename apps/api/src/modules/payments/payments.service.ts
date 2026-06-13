import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { VerifyPaymentByImageDto, ManualVerifyPaymentDto } from './dto/verify-payment.dto';

/** Datos extraídos del comprobante por GPT-4o Vision */
export interface OcrResult {
  amount: number | null;
  senderBank: string | null;
  receiverBank: string | null;
  reference: string | null;
  date: string | null;
  senderName: string | null;
  confidence: 'high' | 'medium' | 'low';
}

/** Tolerancia en pesos para diferencia de monto (redondeos bancarios) */
const AMOUNT_TOLERANCE = 1.0;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly config: ConfigService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get('OPENAI_API_KEY'),
    });
  }

  // ─── Consultas ────────────────────────────────────────────────

  async findByOrder(orderId: string, schemaName: string) {
    return this.prisma.$queryRawUnsafe<any[]>(`
      SELECT
        id, order_id AS "orderId", method, amount, status,
        reference, proof_image_url AS "proofImageUrl",
        ocr_data AS "ocrData",
        verified_by AS "verifiedBy", verified_at AS "verifiedAt",
        created_at AS "createdAt"
      FROM "${schemaName}".payments
      WHERE order_id = $1::uuid
      ORDER BY created_at DESC
    `, orderId);
  }

  // ─── Verificación por imagen (OCR con GPT-4o Vision) ─────────

  async verifyByImage(
    dto: VerifyPaymentByImageDto,
    schemaName: string,
    verifiedByUserId?: string,
  ) {
    // 1. Obtener el pedido
    const order = await this.ordersService.findById(dto.orderId, schemaName);

    if (!['new', 'quoted', 'payment_pending'].includes(order.status)) {
      throw new BadRequestException(
        `El pedido está en estado '${order.status}' y no puede recibir pagos`,
      );
    }

    const orderTotal = parseFloat(order.total);

    // 2. Extraer datos del comprobante con GPT-4o Vision
    this.logger.log(`Procesando comprobante OCR para pedido ${order.orderNumber}`);
    const ocrResult = await this.extractPaymentData(dto.proofImageUrl);

    // 3. Evaluar si el monto coincide
    const amountMatches =
      ocrResult.amount !== null &&
      Math.abs(ocrResult.amount - orderTotal) <= AMOUNT_TOLERANCE;

    const paymentStatus = amountMatches ? 'verified' : 'pending_review';

    // 4. Registrar el pago
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".payments
        (order_id, method, amount, status, reference,
         proof_image_url, ocr_data, verified_by, verified_at)
      VALUES
        ($1::uuid, 'transfer', $2, $3, $4,
         $5, $6::jsonb,
         $7::uuid, $8)
      RETURNING id, status, amount, reference, created_at AS "createdAt"
    `,
      dto.orderId,
      ocrResult.amount ?? 0,
      paymentStatus,
      ocrResult.reference ?? null,
      dto.proofImageUrl,
      JSON.stringify(ocrResult),
      amountMatches ? (verifiedByUserId ?? null) : null,
      amountMatches ? new Date().toISOString() : null,
    );

    const payment = rows[0];

    // 5. Si el monto coincide → avanzar el pedido automáticamente
    if (amountMatches) {
      await this.ordersService.transition(dto.orderId, 'payment_verified', schemaName);
      this.logger.log(`Pago verificado automáticamente para ${order.orderNumber}`);

      return {
        verified: true,
        payment,
        order: { orderNumber: order.orderNumber, status: 'payment_verified' },
        message: `✅ Pago verificado por $${ocrResult.amount}. Tu pedido ${order.orderNumber} está confirmado.`,
        ocrData: ocrResult,
      };
    }

    // 6. Si no coincide → dejar en revisión manual
    this.logger.warn(
      `Monto no coincide para ${order.orderNumber}: OCR=$${ocrResult.amount}, esperado=$${orderTotal}`,
    );

    return {
      verified: false,
      payment,
      order: { orderNumber: order.orderNumber, status: order.status },
      message: ocrResult.amount
        ? `⚠️ El monto del comprobante ($${ocrResult.amount}) no coincide con el total del pedido ($${orderTotal}). Quedó en revisión manual.`
        : `⚠️ No se pudo leer el monto del comprobante. Quedó en revisión manual.`,
      ocrData: ocrResult,
    };
  }

  // ─── Verificación manual (operador confirma) ──────────────────

  async verifyManually(
    dto: ManualVerifyPaymentDto,
    schemaName: string,
    verifiedByUserId: string,
  ) {
    const order = await this.ordersService.findById(dto.orderId, schemaName);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      INSERT INTO "${schemaName}".payments
        (order_id, method, amount, status, reference,
         verified_by, verified_at)
      VALUES
        ($1::uuid, $2, $3, 'verified', $4,
         $5::uuid, NOW())
      RETURNING id, status, amount, reference, created_at AS "createdAt"
    `,
      dto.orderId,
      dto.method,
      dto.amount,
      dto.reference ?? null,
      verifiedByUserId,
    );

    // Avanzar pedido
    await this.ordersService.transition(dto.orderId, 'payment_verified', schemaName);

    return {
      verified: true,
      payment: rows[0],
      order: { orderNumber: order.orderNumber, status: 'payment_verified' },
      message: `✅ Pago de $${dto.amount} verificado manualmente.`,
    };
  }

  // ─── Rechazar pago pendiente ──────────────────────────────────

  async rejectPayment(paymentId: string, schemaName: string) {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".payments
      SET status = 'rejected'
      WHERE id = $1::uuid
    `, paymentId);

    return { success: true, message: 'Pago rechazado' };
  }

  // ─── OCR con GPT-4o Vision ────────────────────────────────────

  private async extractPaymentData(imageUrl: string): Promise<OcrResult> {
    // Si no hay API key configurada (desarrollo sin clave), retornar mock
    if (!this.config.get('OPENAI_API_KEY') || this.config.get('OPENAI_API_KEY') === 'sk-test-not-real') {
      this.logger.warn('OPENAI_API_KEY no configurada — usando OCR simulado');
      return this.mockOcrResult();
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analiza este comprobante de transferencia bancaria y extrae los datos.
Responde ÚNICAMENTE con JSON válido con estas claves exactas:
{
  "amount": número o null,
  "senderBank": "nombre del banco emisor" o null,
  "receiverBank": "nombre del banco receptor" o null,
  "reference": "número de referencia o folio" o null,
  "date": "fecha en formato YYYY-MM-DD" o null,
  "senderName": "nombre del remitente" o null,
  "confidence": "high" | "medium" | "low"
}
Si no puedes leer un campo con certeza, usa null.
El campo "confidence" indica qué tan legible es el comprobante en general.`,
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl, detail: 'high' },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Respuesta vacía de GPT-4o');

      const parsed = JSON.parse(content);
      return {
        amount: parsed.amount ? parseFloat(parsed.amount) : null,
        senderBank: parsed.senderBank ?? null,
        receiverBank: parsed.receiverBank ?? null,
        reference: parsed.reference ?? null,
        date: parsed.date ?? null,
        senderName: parsed.senderName ?? null,
        confidence: parsed.confidence ?? 'low',
      };
    } catch (error) {
      this.logger.error('Error en OCR de comprobante:', error);
      return {
        amount: null,
        senderBank: null,
        receiverBank: null,
        reference: null,
        date: null,
        senderName: null,
        confidence: 'low',
      };
    }
  }

  /** OCR simulado para desarrollo sin API key de OpenAI */
  private mockOcrResult(): OcrResult {
    return {
      amount: 999.99,
      senderBank: 'BBVA México (simulado)',
      receiverBank: 'Banamex (simulado)',
      reference: 'REF-MOCK-001',
      date: new Date().toISOString().split('T')[0],
      senderName: 'Cliente Prueba',
      confidence: 'high',
    };
  }
}
