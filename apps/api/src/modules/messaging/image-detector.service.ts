import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';

/**
 * Image Detector Service — Classifies incoming images and triggers appropriate actions.
 *
 * When a customer sends an image via WhatsApp, this service:
 * 1. Classifies the image type (payment receipt, product photo, random)
 * 2. If payment receipt → triggers OCR auto-verification
 * 3. If product inquiry → identifies the product and responds
 * 4. If unrelated → passes to AI for generic response
 *
 * Uses GPT-4o Vision for classification and extraction.
 */
@Injectable()
export class ImageDetectorService {
  private readonly logger = new Logger(ImageDetectorService.name);
  private readonly openai: OpenAI | null;

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
   * Classify an incoming image and return the detected type + extracted data.
   */
  async classifyImage(imageUrl: string): Promise<ImageClassification> {
    if (!this.openai) {
      this.logger.warn('OpenAI not configured — image classification unavailable');
      return { type: 'unknown', confidence: 0, data: null };
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Eres un clasificador de imágenes para un sistema de comercio por WhatsApp.
Clasifica la imagen en UNA de estas categorías:

1. "payment_receipt" — Comprobante de transferencia bancaria, voucher de pago, captura de movimiento bancario
2. "product_inquiry" — Foto de un producto que el cliente quiere identificar o comparar
3. "delivery_proof" — Foto de un paquete entregado o evidencia de entrega
4. "other" — Cualquier otra cosa (memes, selfies, capturas irrelevantes)

Responde SOLO con JSON:
{
  "type": "payment_receipt" | "product_inquiry" | "delivery_proof" | "other",
  "confidence": 0.0-1.0,
  "details": "descripción breve de lo que ves"
}`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Clasifica esta imagen:' },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 100,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return { type: 'unknown', confidence: 0, data: null };

      const parsed = JSON.parse(match[0]);
      this.logger.debug(`Image classified: ${parsed.type} (confidence: ${parsed.confidence})`);

      return {
        type: parsed.type ?? 'unknown',
        confidence: parsed.confidence ?? 0.5,
        data: { details: parsed.details },
      };
    } catch (err: any) {
      this.logger.error(`Image classification failed: ${err.message}`);
      return { type: 'unknown', confidence: 0, data: null };
    }
  }

  /**
   * Process an incoming image in the context of a conversation.
   * Returns the action to take and any extracted data.
   */
  async processIncomingImage(
    imageUrl: string,
    conversationId: string,
    schemaName: string,
  ): Promise<ImageProcessingResult> {
    // 1. Classify the image
    const classification = await this.classifyImage(imageUrl);

    // 2. Route based on type
    switch (classification.type) {
      case 'payment_receipt':
        return this.handlePaymentReceipt(imageUrl, conversationId, schemaName, classification);

      case 'product_inquiry':
        return this.handleProductInquiry(imageUrl, schemaName, classification);

      case 'delivery_proof':
        return this.handleDeliveryProof(imageUrl, conversationId, schemaName);

      default:
        return {
          action: 'pass_to_ai',
          message: null,
          data: { classification },
        };
    }
  }

  // ─── Handlers by Image Type ───────────────────────────────────

  /**
   * Handle payment receipt: find pending order → trigger OCR verification.
   */
  private async handlePaymentReceipt(
    imageUrl: string,
    conversationId: string,
    schemaName: string,
    classification: ImageClassification,
  ): Promise<ImageProcessingResult> {
    // Find the most recent pending payment for this conversation's customer
    const pending = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT o.id AS order_id, o.order_number, o.total, p.id AS payment_id
      FROM "${schemaName}".conversations c
      JOIN "${schemaName}".orders o ON o.customer_id = c.customer_id
      JOIN "${schemaName}".payments p ON p.order_id = o.id
      WHERE c.id = $1::uuid
        AND o.status = 'payment_pending'
        AND p.status = 'pending'
      ORDER BY o.created_at DESC
      LIMIT 1
    `, conversationId);

    if (!pending[0]) {
      return {
        action: 'no_pending_payment',
        message: '📷 Recibí una imagen que parece un comprobante de pago, pero no encuentro un pedido pendiente de pago. ¿Podrías indicarme el número de pedido?',
        data: { classification },
      };
    }

    const order = pending[0];

    // Save image URL on payment record
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".payments SET proof_image_url = $1 WHERE id = $2::uuid
    `, imageUrl, order.payment_id);

    // Now run OCR to extract amount
    const ocrResult = await this.extractPaymentData(imageUrl);

    if (!ocrResult || ocrResult.amount === null) {
      return {
        action: 'ocr_failed',
        message: `📷 Recibí tu comprobante para el pedido ${order.order_number} ($${parseFloat(order.total).toLocaleString()}). No pude leer el monto automáticamente — lo revisaremos y te confirmo pronto. ⏳`,
        data: { orderId: order.order_id, orderNumber: order.order_number, classification },
      };
    }

    // Compare amounts
    const expected = parseFloat(order.total);
    const discrepancy = Math.abs(ocrResult.amount - expected);
    const TOLERANCE = 2.0;

    if (discrepancy <= TOLERANCE) {
      // AUTO-VERIFY ✅
      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".payments
        SET status = 'verified', ocr_data = $1::jsonb, verified_at = NOW()
        WHERE id = $2::uuid
      `, JSON.stringify(ocrResult), order.payment_id);

      await this.prisma.$executeRawUnsafe(`
        UPDATE "${schemaName}".orders SET status = 'paid', updated_at = NOW()
        WHERE id = $1::uuid
      `, order.order_id);

      this.logger.log(`[${schemaName}] Payment auto-verified via image detection: ${order.order_number}`);

      return {
        action: 'payment_verified',
        message: `✅ *¡Pago confirmado!*\n\n💰 Monto: $${ocrResult.amount.toLocaleString()}\n📋 Pedido: ${order.order_number}\n🏦 Banco: ${ocrResult.bank ?? 'detectado'}\n\nTu pedido ya está en proceso. ¡Gracias! 🎉`,
        data: { orderId: order.order_id, orderNumber: order.order_number, amount: ocrResult.amount, bank: ocrResult.bank },
      };
    }

    // Amount mismatch
    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".payments SET status = 'review', ocr_data = $1::jsonb WHERE id = $2::uuid
    `, JSON.stringify({ ...ocrResult, expected, discrepancy }), order.payment_id);

    return {
      action: 'amount_mismatch',
      message: `⚠️ Recibí tu comprobante por $${ocrResult.amount.toLocaleString()}, pero el total es $${expected.toLocaleString()}. Lo revisaremos manualmente y te confirmo.`,
      data: { orderId: order.order_id, ocrAmount: ocrResult.amount, expected, discrepancy },
    };
  }

  /**
   * Handle product inquiry: customer sends photo asking "do you have this?"
   */
  private async handleProductInquiry(
    imageUrl: string,
    schemaName: string,
    classification: ImageClassification,
  ): Promise<ImageProcessingResult> {
    return {
      action: 'product_inquiry',
      message: null, // Let the AI handle the response with the image context
      data: {
        classification,
        imageUrl,
        instruction: 'El cliente envió una foto de un producto. Describe lo que ves y pregunta si quiere algo similar de tu catálogo.',
      },
    };
  }

  /**
   * Handle delivery proof: photo of delivered package.
   */
  private async handleDeliveryProof(
    imageUrl: string,
    conversationId: string,
    schemaName: string,
  ): Promise<ImageProcessingResult> {
    return {
      action: 'delivery_proof',
      message: '📦 ¡Gracias por confirmar la recepción! Esperamos que disfrutes tu compra. Si necesitas algo más, aquí estamos. 😊',
      data: { imageUrl },
    };
  }

  // ─── OCR Extraction ───────────────────────────────────────────

  private async extractPaymentData(imageUrl: string): Promise<OcrPaymentResult | null> {
    if (!this.openai) return null;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Extrae el monto transferido de este comprobante bancario mexicano.
Responde SOLO JSON: {"amount": number|null, "bank": "string"|null, "reference": "string"|null, "confidence": 0.0-1.0}`,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Monto de esta transferencia:' },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 80,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]);
      if (parsed.amount === null) return null;

      return parsed as OcrPaymentResult;
    } catch {
      return null;
    }
  }
}

// ─── Types ──────────────────────────────────────────────────────

export type ImageType = 'payment_receipt' | 'product_inquiry' | 'delivery_proof' | 'other' | 'unknown';

export interface ImageClassification {
  type: ImageType;
  confidence: number;
  data: any;
}

export interface ImageProcessingResult {
  action: string;
  message: string | null;
  data: any;
}

interface OcrPaymentResult {
  amount: number;
  bank: string | null;
  reference: string | null;
  confidence: number;
}
