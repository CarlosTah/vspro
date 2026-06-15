import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { StaffNotificationsService } from '../staff-notifications/staff-notifications.service';

export type UrgencyLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface UrgencyResult {
  level: UrgencyLevel;
  keywords: string[];
  requiresImmediate: boolean;
  suggestedResponse: string;
  alertStaff: boolean;
}

/**
 * Urgency Detection — NLP-based alarm system for health/medical contexts.
 *
 * Scans incoming messages for urgency keywords and patterns.
 * If critical: immediately alerts the doctor/vet/professional.
 *
 * Used by: clínicas, veterinarias, consultorios dentales.
 * Examples:
 * - "Mi perro está vomitando sangre" → CRITICAL → alert vet
 * - "Tiene un poco de fiebre" → MEDIUM → suggest appointment
 * - "Me duele mucho, no puedo dormir" → HIGH → alert doctor
 */
@Injectable()
export class UrgencyDetectionService {
  private readonly logger = new Logger(UrgencyDetectionService.name);
  private readonly openai: OpenAI;

  // Keywords for fast heuristic detection (before LLM call)
  private readonly CRITICAL_KEYWORDS = [
    'sangre', 'sangrando', 'no respira', 'inconsciente', 'convulsión', 'convulsiones',
    'desmayó', 'atropellado', 'envenenó', 'veneno', 'infarto', 'ahogando',
    'emergencia', 'urgente', 'muy grave', 'no reacciona',
  ];

  private readonly HIGH_KEYWORDS = [
    'mucho dolor', 'no puede caminar', 'hinchado', 'infección', 'fiebre alta',
    'vomitando', 'diarrea', 'no come', 'herida abierta', 'fractura',
  ];

  constructor(
    private readonly config: ConfigService,
    private readonly staffNotifications: StaffNotificationsService,
  ) {
    this.openai = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') });
  }

  /**
   * Analyze a message for urgency (fast heuristic + optional LLM).
   */
  async analyze(message: string, context?: { businessType?: string }): Promise<UrgencyResult> {
    const lower = message.toLowerCase();

    // Fast heuristic check
    const criticalMatch = this.CRITICAL_KEYWORDS.filter(kw => lower.includes(kw));
    if (criticalMatch.length > 0) {
      return {
        level: 'critical',
        keywords: criticalMatch,
        requiresImmediate: true,
        suggestedResponse: 'Esto suena urgente. Contactando al profesional de inmediato.',
        alertStaff: true,
      };
    }

    const highMatch = this.HIGH_KEYWORDS.filter(kw => lower.includes(kw));
    if (highMatch.length > 0) {
      return {
        level: 'high',
        keywords: highMatch,
        requiresImmediate: false,
        suggestedResponse: 'Entiendo tu preocupación. Voy a solicitar una cita urgente para revisarte.',
        alertStaff: true,
      };
    }

    // For medium-ambiguous cases, use LLM
    if (lower.includes('dolor') || lower.includes('mal') || lower.includes('preocupa')) {
      return this.analyzeWithLLM(message, context?.businessType ?? 'health');
    }

    return { level: 'none', keywords: [], requiresImmediate: false, suggestedResponse: '', alertStaff: false };
  }

  /**
   * Alert the appropriate staff member when urgency is detected.
   */
  async alertIfNeeded(result: UrgencyResult, customerName: string, schemaName: string): Promise<void> {
    if (!result.alertStaff) return;

    const emoji = result.level === 'critical' ? '🚨' : '⚠️';
    const msg = `${emoji} *ALERTA: ${result.level.toUpperCase()}*\n\nPaciente: ${customerName}\nSíntomas: ${result.keywords.join(', ')}\n\n${result.requiresImmediate ? '¡Requiere atención INMEDIATA!' : 'Revisar lo antes posible.'}`;

    await this.staffNotifications.notifyAllStaff('customer_escalation', msg, schemaName);
  }

  private async analyzeWithLLM(message: string, businessType: string): Promise<UrgencyResult> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `Evalúa la urgencia médica/veterinaria de este mensaje. Contexto: ${businessType}.
Responde JSON: {"level":"none|low|medium|high|critical","keywords":[],"requiresImmediate":bool,"suggestedResponse":"...","alertStaff":bool}`,
        }, { role: 'user', content: message }],
        temperature: 0.1,
        max_tokens: 200,
      });
      return JSON.parse((response.choices[0].message.content ?? '{}').replace(/```json\n?|```\n?/g, '').trim());
    } catch {
      return { level: 'low', keywords: [], requiresImmediate: false, suggestedResponse: '', alertStaff: false };
    }
  }
}
