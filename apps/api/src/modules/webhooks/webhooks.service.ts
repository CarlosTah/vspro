import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectQueue('messages') private readonly messageQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verifica el webhook de Meta durante la configuración inicial (global, sin tenant).
   * Se usa al configurar la app en Meta Developers.
   */
  verifyGlobal(mode: string, token: string, challenge: string): string {
    if (mode !== 'subscribe') {
      throw new BadRequestException('Modo de verificación inválido');
    }

    const globalToken = this.config.get('META_WEBHOOK_VERIFY_TOKEN', '');

    if (token === globalToken) {
      this.logger.log('Webhook global verificado correctamente');
      return challenge;
    }

    this.logger.warn('Verificación de webhook global fallida');
    throw new UnauthorizedException('Token de verificación inválido');
  }

  /**
   * Encola mensaje recibido en el endpoint global.
   * Extrae el phone_number_id del payload para rutear al tenant correcto.
   */
  async enqueueMessageGlobal(payload: unknown): Promise<void> {
    const p = payload as any;
    const entry = p?.entry?.[0];
    const changes = entry?.changes?.[0];
    const phoneNumberId = changes?.value?.metadata?.phone_number_id;

    if (!phoneNumberId) {
      this.logger.warn('Webhook global: no se encontró phone_number_id en payload');
      return;
    }

    // TODO: Lookup tenant by phone_number_id in settings
    // For now, enqueue with the phone_number_id for routing
    await this.messageQueue.add(
      'process-incoming-message',
      { phoneNumberId, payload },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.debug(`Mensaje global encolado (phone: ${phoneNumberId})`);
  }

  /**
   * Verifica el webhook de Meta durante la configuración inicial.
   * Meta envía un GET con hub.challenge y espera que lo devolvamos.
   */
  async verify(
    tenantSlug: string,
    mode: string,
    token: string,
    challenge: string,
  ): Promise<string> {
    if (mode !== 'subscribe') {
      throw new BadRequestException('Modo de verificación inválido');
    }

    // Use global verify token from env (simpler for dev)
    const globalToken = this.config.get('META_WEBHOOK_VERIFY_TOKEN', '');

    // Also check tenant-specific token if available
    let tenantToken: string | undefined;
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { settings: true },
      });
      const settings = tenant?.settings as Record<string, any>;
      tenantToken = settings?.webhookVerifyToken;
    } catch { /* tenant may not have settings column */ }

    if (token === globalToken || (tenantToken && token === tenantToken)) {
      this.logger.log(`Webhook verificado para tenant: ${tenantSlug}`);
      return challenge;
    }

    this.logger.warn(`Verificación de webhook fallida para tenant: ${tenantSlug}`);
    throw new UnauthorizedException('Token de verificación inválido');
  }

  /**
   * Verifica la firma HMAC-SHA256 del payload de Meta.
   * Previene que actores maliciosos envíen payloads falsos.
   * En desarrollo, permite pasar sin firma si META_APP_SECRET no está configurado.
   */
  async verifySignature(payload: Buffer | unknown, signature: string): Promise<void> {
    const appSecret = this.config.get('META_APP_SECRET');

    // In development without app secret, skip verification
    if (!appSecret || appSecret === 'CHANGE_ME') {
      this.logger.warn('HMAC verification skipped — META_APP_SECRET not configured');
      return;
    }

    if (!signature) {
      throw new UnauthorizedException('Firma de webhook ausente');
    }

    const body = Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));

    const expectedSignature =
      'sha256=' + crypto.createHmac('sha256', appSecret).update(body).digest('hex');

    // Comparación segura contra timing attacks
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      this.logger.warn('Firma de webhook inválida — posible request malicioso');
      throw new UnauthorizedException('Firma de webhook inválida');
    }
  }

  /**
   * Encola el mensaje para procesamiento asíncrono.
   * El worker lo procesará con la IA sin bloquear la respuesta a Meta.
   */
  async enqueueMessage(tenantSlug: string, payload: unknown): Promise<void> {
    await this.messageQueue.add(
      'process-incoming-message',
      { tenantSlug, payload },
      {
        attempts: 3, // reintentar hasta 3 veces si falla
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s, 4s, 8s
        },
        removeOnComplete: 100, // mantener últimos 100 jobs completados
        removeOnFail: 500, // mantener últimos 500 jobs fallidos para debug
      },
    );
  }
}
