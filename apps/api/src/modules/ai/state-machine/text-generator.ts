import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

/**
 * Text Generator — Uses GPT-4o-mini to generate natural language responses.
 * ONLY writes text. Does NOT make decisions or call tools.
 * Receives a strict context of what to say and just makes it sound natural.
 */
@Injectable()
export class TextGeneratorService {
  private readonly logger = new Logger(TextGeneratorService.name);
  private readonly openai: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') });
  }

  /**
   * Generate a natural-language WhatsApp message based on the given context.
   * @param context - What the system wants to communicate (from state machine)
   * @param personality - Tone/personality instructions for the business
   * @param customerName - If known, to personalize
   */
  async generate(context: string, personality: string, customerName?: string): Promise<string> {
    const apiKey = this.config.get('OPENAI_API_KEY');
    if (!apiKey || apiKey === 'sk-...') {
      return context; // Fallback: return the raw context as-is
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Eres un redactor de mensajes de WhatsApp para un negocio. 
${personality}

REGLAS ESTRICTAS:
- Genera UN mensaje corto y natural basado en el CONTEXTO de abajo.
- NO inventes información que no esté en el contexto.
- NO agregues productos, precios o datos que no se mencionan.
- Sé conciso — máximo 3-4 líneas para WhatsApp.
- NO saludes (Hola, Buenos días) en CADA mensaje. Solo saluda en la PRIMERA interacción. En mensajes posteriores ve directo al punto.
- NO repitas el nombre del cliente en cada mensaje. Úsalo solo al inicio o cuando sea natural.
- Usa emojis con moderación (1-2 por mensaje).
- ${customerName ? `El cliente se llama ${customerName}. Úsalo si es natural.` : 'No sabes el nombre del cliente.'}
- Responde SOLO en español.
- NO incluyas información meta como "Contexto:" o "Sistema:".`,
          },
          {
            role: 'user',
            content: `CONTEXTO (lo que debes comunicar):\n${context}`,
          },
        ],
        temperature: 0.4,
        max_tokens: 200,
      });

      return response.choices[0]?.message?.content?.trim() ?? context;
    } catch (err: any) {
      this.logger.error(`Text generation failed: ${err.message}`);
      return context; // Fallback to raw context
    }
  }
}
