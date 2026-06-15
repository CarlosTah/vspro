import { Module } from '@nestjs/common';
import { AudioTranscriptionService } from './audio-transcription.service';
import { AudioController } from './audio.controller';

/**
 * Audio Module — Transcripción de audios de WhatsApp con GPT-4o Audio/Whisper.
 *
 * Problema: Los dueños de PYMEs mexicanas mandan audios, no escriben.
 * Si VSPRO no entiende audios, pierde ~70% de las interacciones del dueño.
 *
 * Flujo:
 * 1. Dueño/cliente manda audio por WhatsApp
 * 2. Webhook recibe el audio (URL de Meta)
 * 3. AudioTranscriptionService descarga y transcribe con Whisper
 * 4. El texto resultante se procesa como mensaje normal por el AI Engine
 *
 * También soporta:
 * - Instrucciones por audio: "Avisa a todos mis clientes que mañana cierro"
 * - Pedidos por voz: "Quiero 3 tacos de pastor y 2 aguas"
 * - Comandos del dueño: "Dime cuánto vendí hoy"
 */
@Module({
  controllers: [AudioController],
  providers: [AudioTranscriptionService],
  exports: [AudioTranscriptionService],
})
export class AudioModule {}
