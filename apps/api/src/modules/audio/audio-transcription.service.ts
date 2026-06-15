import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import axios from 'axios';
import { Readable } from 'stream';

/**
 * Audio Transcription Service — Converts voice messages to text using OpenAI Whisper.
 *
 * Supports:
 * - WhatsApp voice notes (OGG/OPUS format)
 * - Audio files from any Meta channel
 * - Direct URL or base64 input
 *
 * Process:
 * 1. Download audio from Meta CDN URL (requires access token)
 * 2. Send to OpenAI Whisper API for transcription
 * 3. Return text for processing by AI Engine
 */

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  confidence: number;
}

@Injectable()
export class AudioTranscriptionService {
  private readonly logger = new Logger(AudioTranscriptionService.name);
  private readonly openai: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({ apiKey: this.config.get('OPENAI_API_KEY') });
  }

  /**
   * Transcribe an audio file from a URL (typically Meta CDN).
   * Downloads the file and sends to Whisper.
   */
  async transcribeFromUrl(audioUrl: string, accessToken?: string): Promise<TranscriptionResult> {
    this.logger.debug(`Transcribing audio from URL: ${audioUrl.substring(0, 50)}...`);

    try {
      // 1. Download audio from Meta CDN
      const audioBuffer = await this.downloadAudio(audioUrl, accessToken);

      // 2. Transcribe with Whisper
      const result = await this.transcribeBuffer(audioBuffer);

      this.logger.log(`Transcription complete: "${result.text.substring(0, 60)}..." (${result.duration}s)`);
      return result;

    } catch (err: any) {
      this.logger.error(`Transcription failed: ${err.message}`);
      return {
        text: '',
        language: 'es',
        duration: 0,
        confidence: 0,
      };
    }
  }

  /**
   * Transcribe an audio buffer directly (for testing or pre-downloaded files).
   */
  async transcribeBuffer(audioBuffer: Buffer, filename = 'audio.ogg'): Promise<TranscriptionResult> {
    // Create a File-like object for the OpenAI API
    const file = new File([audioBuffer], filename, { type: 'audio/ogg' });

    const response = await this.openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language: 'es',
      response_format: 'verbose_json',
    });

    return {
      text: response.text ?? '',
      language: (response as any).language ?? 'es',
      duration: (response as any).duration ?? 0,
      confidence: 1.0, // Whisper doesn't return per-segment confidence in simple mode
    };
  }

  /**
   * Transcribe and extract actionable instruction from audio.
   * Uses GPT-4o to interpret the transcription as a business instruction.
   */
  async transcribeAndInterpret(audioUrl: string, accessToken?: string): Promise<{
    transcription: string;
    instruction: string;
    type: 'order' | 'command' | 'broadcast' | 'question' | 'general';
    confidence: number;
  }> {
    const result = await this.transcribeFromUrl(audioUrl, accessToken);

    if (!result.text) {
      return { transcription: '', instruction: '', type: 'general', confidence: 0 };
    }

    // Classify the instruction type with GPT-4o-mini
    const classification = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Clasifica el siguiente mensaje de voz de un dueño de negocio mexicano.
Tipos:
- order: quiere hacer un pedido o dar de alta algo
- command: quiere ejecutar una acción del sistema (ventas del día, stock, etc.)
- broadcast: quiere enviar un mensaje a múltiples clientes
- question: pregunta sobre su negocio
- general: saludo u otro

Responde SOLO JSON: {"type":"...", "instruction":"instrucción clara en texto", "confidence":0.0-1.0}`,
        },
        { role: 'user', content: result.text },
      ],
      temperature: 0.1,
      max_tokens: 200,
    });

    try {
      const parsed = JSON.parse(classification.choices[0].message.content ?? '{}');
      return {
        transcription: result.text,
        instruction: parsed.instruction ?? result.text,
        type: parsed.type ?? 'general',
        confidence: parsed.confidence ?? 0.7,
      };
    } catch {
      return {
        transcription: result.text,
        instruction: result.text,
        type: 'general',
        confidence: 0.5,
      };
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async downloadAudio(url: string, accessToken?: string): Promise<Buffer> {
    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers,
      timeout: 30000,
    });

    return Buffer.from(response.data);
  }
}
