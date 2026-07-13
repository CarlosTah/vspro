import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ParsedIntent, IntentType } from './order-state-machine';

/**
 * Intent Classifier — Uses GPT-4o-mini to classify customer messages.
 * ONLY classifies intent. Does NOT generate responses.
 * Fast, cheap, and focused.
 * 
 * Includes confidence threshold: if the model is unsure (<0.6),
 * returns 'other' to trigger a clarification instead of guessing.
 */
@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);
  private readonly openai: OpenAI;
  private readonly CONFIDENCE_THRESHOLD = 0.6;

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') });
  }

  async classify(message: string, currentState: string, hasImage: boolean = false): Promise<ParsedIntent> {
    const apiKey = this.config.get('OPENAI_API_KEY');
    if (!apiKey || apiKey === 'sk-...') {
      return { type: 'other', text: message };
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Clasifica el mensaje del cliente en UNA categoría. Responde SOLO con JSON válido.

Estado actual de la conversación: "${currentState}"

Categorías posibles:
- greeting: saludo simple (hola, buenos días)
- want_to_order: quiere hacer un pedido (quiero pedir, qué tienen)
- add_items: especifica productos con cantidades. Extrae items como array.
- confirm_yes: confirma algo (sí, correcto, dale, va)
- confirm_no: niega/rechaza (no, cambia, espera)
- modify_order: quiere modificar pedido existente
- want_delivery: quiere envío a domicilio (a domicilio, envíamelo, delivery)
- want_pickup: quiere recoger (paso a recoger, recojo, en local)
- give_address: da una dirección física (calle X número Y, colonia Z). NO clasifiques preguntas como direcciones.
- give_location: envía ubicación GPS
- want_cod: pago en efectivo/contra entrega (efectivo, al repartidor, contra entrega, COD)
- want_transfer: pago por transferencia (transferencia, deposito)
- payment_proof: envía comprobante de pago (imagen de transferencia)
- check_status: pregunta por estado de pedido (cómo va mi pedido, ya está)
- check_menu: pide ver el menú o promociones (menú, carta, qué tienen, precios, promociones)
- cancel: quiere cancelar (cancelar, ya no quiero)
- complaint: queja o problema (tarda mucho, está mal, quiero hablar con alguien)
- repeat_order: quiere repetir pedido anterior (lo mismo, mi pedido habitual)
- other: no encaja en ninguna categoría, es ambiguo, o es una pregunta general

${hasImage ? 'NOTA: El cliente envió una imagen. Si el estado es "processing_payment", es payment_proof. Si es "setting_address", puede ser referencia visual (give_address).' : ''}

IMPORTANTE: Incluye un campo "confidence" (0.0 a 1.0) indicando qué tan seguro estás de la clasificación.
- 0.9-1.0: Muy claro (ej: "Hola" → greeting, "4 tacos de pastor" → add_items)
- 0.6-0.8: Bastante seguro pero algo ambiguo
- 0.3-0.5: Poco seguro, el mensaje es confuso o podría ser otra categoría
- 0.0-0.2: No tengo idea

Formato de respuesta JSON (SIEMPRE incluye "confidence"):
{"type": "add_items", "confidence": 0.95, "items": [{"productName": "Taco al Pastor", "quantity": 3, "notes": "sin cebolla"}]}
{"type": "give_address", "confidence": 0.85, "address": {"street": "Calle 5", "colony": "Centro"}}
{"type": "confirm_yes", "confidence": 0.9}
{"type": "other", "confidence": 0.4}`,
          },
          { role: 'user', content: message },
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content);

      // Validate the type is a known intent
      const validTypes: IntentType[] = [
        'greeting', 'want_to_order', 'add_items', 'confirm_yes', 'confirm_no',
        'modify_order', 'want_delivery', 'want_pickup', 'give_address', 'give_location',
        'want_cod', 'want_transfer', 'payment_proof', 'check_status', 'check_menu',
        'cancel', 'complaint', 'repeat_order', 'other',
      ];

      let intentType = validTypes.includes(parsed.type) ? parsed.type : 'other';
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.7;

      // CONFIDENCE THRESHOLD: If the model is unsure, fall back to 'other'
      // This prevents misclassification on ambiguous messages
      if (confidence < this.CONFIDENCE_THRESHOLD && intentType !== 'other' && intentType !== 'greeting') {
        this.logger.warn(`Low confidence (${confidence}) for "${message.substring(0, 40)}" → classified as ${intentType}, falling back to 'other'`);
        intentType = 'other';
      }

      return {
        type: intentType,
        items: parsed.items,
        address: parsed.address,
        location: parsed.location,
        orderNumber: parsed.orderNumber,
        text: message,
      };
    } catch (err: any) {
      this.logger.error(`Intent classification failed: ${err.message}`);
      return { type: 'other', text: message };
    }
  }

  /**
   * Special case: detect location from WhatsApp location message format.
   */
  classifyLocation(lat: number, lng: number): ParsedIntent {
    return { type: 'give_location', location: { lat, lng }, text: `📍 ${lat},${lng}` };
  }
}
