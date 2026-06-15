import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';

export interface ClassificationResult {
  category: string;
  subcategory: string;
  severity: 'low' | 'medium' | 'high' | 'urgent';
  description: string;
  estimatedPriceRange: { min: number; max: number; currency: string };
  confidence: number;
  suggestedAction: string;
}

/**
 * Issue Classifier — Analyzes photos/videos of problems and provides
 * category + estimated price from tabulador.
 *
 * Used by: plomeros, electricistas, AC, talleres mecánicos.
 * Flow: Customer sends photo of problem → GPT-4o Vision classifies →
 *       Returns category, severity, and price estimate from tabulador.
 */
@Injectable()
export class IssueClassifierService {
  private readonly logger = new Logger(IssueClassifierService.name);
  private readonly openai: OpenAI;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    this.openai = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') });
  }

  /**
   * Classify an issue from image and return diagnosis + price estimate.
   */
  async classifyFromImage(imageUrl: string, businessType: string, schemaName: string): Promise<ClassificationResult> {
    // Load tabulador from tenant config (service pricing)
    const tabulador = await this.loadTabulador(schemaName);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'system',
        content: `Eres un experto técnico que diagnostica problemas desde fotos.
Tipo de negocio: ${businessType}
Tabulador de precios: ${JSON.stringify(tabulador)}

Clasifica el problema de la imagen y estima un precio basado en el tabulador.
Responde SOLO JSON: {"category":"...","subcategory":"...","severity":"low|medium|high|urgent","description":"diagnóstico breve","estimatedPriceRange":{"min":0,"max":0,"currency":"MXN"},"confidence":0.0-1.0,"suggestedAction":"..."}`,
      }, {
        role: 'user',
        content: [
          { type: 'text', text: 'Diagnostica este problema y dame un estimado de costo.' },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        ],
      }],
      max_tokens: 500,
      temperature: 0.2,
    });

    try {
      const cleaned = (response.choices[0].message.content ?? '{}').replace(/```json\n?|```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { category: 'general', subcategory: 'unclassified', severity: 'medium', description: 'No se pudo clasificar', estimatedPriceRange: { min: 0, max: 0, currency: 'MXN' }, confidence: 0, suggestedAction: 'Solicitar visita técnica' };
    }
  }

  /**
   * Classify from text description (when no image available).
   */
  async classifyFromText(description: string, businessType: string, schemaName: string): Promise<ClassificationResult> {
    const tabulador = await this.loadTabulador(schemaName);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `Clasifica este problema de ${businessType}. Tabulador: ${JSON.stringify(tabulador)}
Responde JSON: {"category":"...","subcategory":"...","severity":"low|medium|high|urgent","description":"...","estimatedPriceRange":{"min":0,"max":0,"currency":"MXN"},"confidence":0.0-1.0,"suggestedAction":"..."}`,
      }, { role: 'user', content: description }],
      temperature: 0.2,
      max_tokens: 300,
    });

    try {
      return JSON.parse((response.choices[0].message.content ?? '{}').replace(/```json\n?|```\n?/g, '').trim());
    } catch {
      return { category: 'general', subcategory: 'unclassified', severity: 'medium', description, estimatedPriceRange: { min: 0, max: 0, currency: 'MXN' }, confidence: 0, suggestedAction: 'Contactar técnico' };
    }
  }

  private async loadTabulador(schemaName: string): Promise<Record<string, any>> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT custom_tools FROM "${schemaName}".ai_config LIMIT 1
      `);
      const tools = rows[0]?.custom_tools ?? [];
      const pricingTool = tools.find((t: any) => t.name === 'pricing_tabulador');
      return pricingTool?.config ?? { note: 'Sin tabulador configurado — usar precios generales del mercado' };
    } catch {
      return {};
    }
  }
}
