import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';

/**
 * Payment verification service using GPT-4o Vision for OCR.
 * Analyzes payment proof images (bank transfer screenshots, deposit receipts)
 * and extracts structured data for automated verification.
 *
 * Strategy: OCR via GPT-4o Vision API
 * - Extracts: amount, reference, date, bank, beneficiary
 * - Matches against pending payments in the tenant schema
 * - Auto-verifies if extracted data matches within tolerance
 */
@Injectable()
export class PaymentVerificationService {
  private readonly logger = new Logger(PaymentVerificationService.name);
  private readonly openai: OpenAI | null;
  private readonly AMOUNT_TOLERANCE = 1.0; // $1 MXN tolerance for rounding

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const key = this.config.get('OPENAI_API_KEY');
    this.openai = key && !key.startsWith('sk-test') && key !== 'sk-...'
      ? new OpenAI({ apiKey: key })
      : null;
  }

  /**
   * Verify a payment proof image using GPT-4o Vision OCR.
   * Returns extracted data and verification result.
   */
  async verifyByImage(
    imageUrl: string,
    orderId: string,
    schemaName: string,
  ): Promise<VerificationResult> {
    // 1. Get the pending payment for this order
    const payments = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT p.id, p.amount, p.status, o.order_number, o.total
      FROM "${schemaName}".payments p
      JOIN "${schemaName}".orders o ON o.id = p.order_id
      WHERE p.order_id = $1::uuid AND p.status = 'pending'
      ORDER BY p.created_at DESC LIMIT 1
    `, orderId);

    if (!payments[0]) {
      return {
        verified: false,
        reason: 'No pending payment found for this order',
        ocrData: null,
      };
    }

    const payment = payments[0];
    const expectedAmount = parseFloat(payment.amount || payment.total);

    // 2. Extract data from image using GPT-4o Vision
    const ocrData = await this.extractFromImage(imageUrl);

    if (!ocrData) {
      return {
        verified: false,
        reason: 'Could not extract payment data from image (OCR failed)',
        ocrData: null,
      };
    }

    // 3. Match extracted amount against expected
    const amountMatch = ocrData.amount !== null
      && Math.abs(ocrData.amount - expectedAmount) <= this.AMOUNT_TOLERANCE;

    // 4. Update payment record with OCR data
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".payments
      SET ocr_data = $1::jsonb,
          proof_image_url = $2
      WHERE id = $3::uuid
    `, JSON.stringify(ocrData), imageUrl, payment.id);

    if (amountMatch) {
      // Auto-verify
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".payments
        SET status = 'verified', verified_at = NOW()
        WHERE id = $1::uuid
      `, payment.id);

      this.logger.log(
        `[${schemaName}] Payment ${payment.id} auto-verified: $${ocrData.amount} matches expected $${expectedAmount}`,
      );

      return {
        verified: true,
        reason: 'Amount matches — auto-verified',
        ocrData,
        paymentId: payment.id,
        extractedAmount: ocrData.amount,
        expectedAmount,
      };
    }

    // Amount mismatch — flag for manual review
    this.logger.warn(
      `[${schemaName}] Payment ${payment.id} amount mismatch: extracted $${ocrData.amount}, expected $${expectedAmount}`,
    );

    return {
      verified: false,
      reason: `Amount mismatch: extracted $${ocrData.amount}, expected $${expectedAmount}`,
      ocrData,
      paymentId: payment.id,
      extractedAmount: ocrData.amount,
      expectedAmount,
    };
  }

  /**
   * Extract payment data from an image using GPT-4o Vision.
   */
  async extractFromImage(imageUrl: string): Promise<OcrPaymentData | null> {
    if (!this.openai) {
      this.logger.warn('OpenAI not configured — OCR unavailable');
      return null;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Eres un sistema de OCR especializado en comprobantes de pago bancarios mexicanos.
Extrae la siguiente información del comprobante de pago en la imagen.
Responde SOLO con JSON válido:
{
  "amount": number | null,
  "reference": "string" | null,
  "date": "YYYY-MM-DD" | null,
  "time": "HH:MM" | null,
  "bank": "string" | null,
  "beneficiary": "string" | null,
  "concept": "string" | null,
  "confidence": 0.0-1.0
}
Si no puedes leer algún campo, usa null. El campo confidence indica tu certeza general.`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extrae los datos de este comprobante de pago:' },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 300,
      });

      const content = response.choices[0]?.message?.content ?? '';

      // Parse JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.error('OCR response did not contain valid JSON');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]) as OcrPaymentData;
      this.logger.debug(`OCR extracted: amount=${parsed.amount}, ref=${parsed.reference}, confidence=${parsed.confidence}`);

      return parsed;
    } catch (err: any) {
      this.logger.error(`OCR extraction failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Manual verification by admin (when OCR is inconclusive).
   */
  async verifyManual(
    paymentId: string,
    verifiedById: string,
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".payments
      SET status = 'verified', verified_by = $1::uuid, verified_at = NOW()
      WHERE id = $2::uuid AND status IN ('pending', 'review')
    `, verifiedById, paymentId);
  }

  /**
   * Reject a payment (fraudulent or incorrect).
   */
  async reject(
    paymentId: string,
    reason: string,
    verifiedById: string,
    schemaName: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".payments
      SET status = 'rejected',
          verified_by = $1::uuid,
          verified_at = NOW(),
          reference = COALESCE(reference, '') || $2
      WHERE id = $3::uuid
    `, verifiedById, `\n[RECHAZADO: ${reason}]`, paymentId);
  }
}

// ─── Types ──────────────────────────────────────────────────────

export interface OcrPaymentData {
  amount: number | null;
  reference: string | null;
  date: string | null;
  time: string | null;
  bank: string | null;
  beneficiary: string | null;
  concept: string | null;
  confidence: number;
}

export interface VerificationResult {
  verified: boolean;
  reason: string;
  ocrData: OcrPaymentData | null;
  paymentId?: string;
  extractedAmount?: number | null;
  expectedAmount?: number;
}
