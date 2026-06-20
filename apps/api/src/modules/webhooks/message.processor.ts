import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../database/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { ConversationsService } from '../conversations/conversations.service';
import { AiEngineService } from '../ai/ai-engine.service';
import { MessagingService } from '../messaging/messaging.service';
import { QuotaService } from '../billing/quota.service';
import { PaymentsService } from '../payments/payments.service';
import { IncomingMessage } from '@vspro/shared';

interface MessageJob {
  tenantSlug: string;
  payload: any;
}

@Processor('messages')
export class MessageProcessor {
  private readonly logger = new Logger(MessageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly conversationsService: ConversationsService,
    private readonly aiEngine: AiEngineService,
    private readonly messagingService: MessagingService,
    private readonly quotaService: QuotaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Process('process-incoming-message')
  async handleIncomingMessage(job: Job<MessageJob>) {
    const { tenantSlug, payload } = job.data;

    try {
      // 1. Resolver tenant
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        include: { plan: true },
      });

      if (!tenant || tenant.status !== 'ACTIVE' && tenant.status !== 'TRIAL') {
        this.logger.warn(`Tenant inactivo o no encontrado: ${tenantSlug}`);
        return;
      }

      const schema = tenant.schemaName;

      // 2. Parsear el mensaje según el canal
      const message = this.messagingService.parseIncoming(payload);
      if (!message) {
        this.logger.debug(`Payload sin mensaje procesable para ${tenantSlug}`);
        return;
      }

      this.logger.log(
        `Procesando mensaje [${message.channelType}] de ${message.senderId} → ${tenantSlug}`,
      );

      // 3. Buscar o crear cliente
      const customer = await this.customersService.findOrCreateByChannel(
        message.channelType,
        message.senderId,
        message.senderName,
        schema,
      );

      // 4. Buscar o crear conversación activa
      const conversation = await this.conversationsService.findOrCreate(
        customer.id,
        message.channelType,
        message.messageId,
        schema,
      );

      // 5. Guardar mensaje entrante
      await this.conversationsService.saveMessage(
        conversation.id,
        'inbound',
        message.type,
        message.text ?? null,
        message.mediaUrl ?? null,
        message.messageId,
        schema,
      );

      // 5.5. AUTO-VERIFICACIÓN DE PAGO: Si es imagen y hay pedido pendiente
      if (message.type === 'image' && message.mediaUrl) {
        const pendingOrder = await this.findPendingPaymentOrder(customer.id, schema);
        if (pendingOrder) {
          this.logger.log(`Imagen recibida con pedido pendiente ${pendingOrder.orderNumber} — procesando como comprobante`);
          const paymentResult = await this.paymentsService.verifyByImage(
            { orderId: pendingOrder.id, proofImageUrl: message.mediaUrl },
            schema,
          );

          // Enviar resultado al cliente
          await this.messagingService.sendText(
            message.channelType,
            message.senderId,
            paymentResult.message,
            schema,
          );

          await this.conversationsService.saveMessage(
            conversation.id, 'outbound', 'text', paymentResult.message, null, null, schema,
          );

          // Incrementar quotas
          await this.quotaService.increment(tenant.id, 'messages').catch(() => {});
          await this.quotaService.increment(tenant.id, 'ocr').catch(() => {});
          return; // No pasar a la IA — ya se procesó
        }
      }

      // 6. Transcribir audio si es mensaje de voz
      if ((message.type === 'audio' || message.type === 'voice') && message.mediaUrl) {
        this.logger.log(`Audio recibido de ${message.senderId} → transcribiendo con Whisper`);
        try {
          const { ConfigService } = await import('@nestjs/config');
          const OpenAI = (await import('openai')).default;
          const axios = (await import('axios')).default;

          const apiKey = process.env.OPENAI_API_KEY;
          if (apiKey) {
            // Download audio from Meta
            const channelRows = await this.prisma.$queryRawUnsafe<any[]>(
              `SELECT access_token FROM "${schema}".channels WHERE type = 'whatsapp' AND is_active = true LIMIT 1`
            );
            const accessToken = channelRows[0]?.access_token;

            if (accessToken) {
              // Get media URL from Meta
              const mediaInfo = await axios.get(message.mediaUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              const audioUrl = mediaInfo.data?.url;

              if (audioUrl) {
                // Download actual audio file
                const audioResponse = await axios.get(audioUrl, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                  responseType: 'arraybuffer',
                });

                // Transcribe with Whisper
                const openai = new OpenAI({ apiKey });
                const audioBuffer = Buffer.from(audioResponse.data);
                const file = new File([audioBuffer], 'audio.ogg', { type: 'audio/ogg' });
                const transcription = await openai.audio.transcriptions.create({
                  model: 'whisper-1',
                  file,
                  language: 'es',
                });

                // Replace message text with transcription
                message.text = transcription.text;
                message.type = 'text'; // Treat as text from here
                this.logger.log(`Transcripción: "${transcription.text.slice(0, 100)}"`);
              }
            }
          }
        } catch (err: any) {
          this.logger.error(`Error transcribiendo audio: ${err.message}`);
          // If transcription fails, send error message to user
          message.text = '[Audio recibido pero no se pudo transcribir]';
          message.type = 'text';
        }
      }

      // 7. Procesar con IA y obtener respuesta
      const aiResponse = await this.aiEngine.processMessage(
        tenant,
        conversation,
        message,
        schema,
      );

      // 7. Enviar respuesta al cliente
      if (aiResponse.text) {
        await this.messagingService.sendText(
          message.channelType,
          message.senderId,
          aiResponse.text,
          tenant.schemaName,
        );

        // 8. Guardar mensaje saliente
        await this.conversationsService.saveMessage(
          conversation.id,
          'outbound',
          'text',
          aiResponse.text,
          null,
          null,
          schema,
        );
      }

      // 9. Actualizar contexto de la conversación con el estado actual
      if (aiResponse.updatedContext) {
        await this.conversationsService.updateContext(
          conversation.id,
          aiResponse.updatedContext,
          schema,
        );
      }

      // 10. Incrementar quotas de uso
      await this.quotaService.increment(tenant.id, 'messages').catch(() => {});
      await this.quotaService.increment(tenant.id, 'ai').catch(() => {});

      this.logger.log(`Mensaje procesado exitosamente para ${tenantSlug}`);
    } catch (error) {
      this.logger.error(
        `Error procesando mensaje para ${tenantSlug}:`,
        error,
      );
      throw error; // BullMQ reintentará según la configuración
    }
  }

  /**
   * Busca si el cliente tiene un pedido en estado payment_pending.
   * Si lo tiene y envía una imagen, se asume que es un comprobante de pago.
   */
  private async findPendingPaymentOrder(
    customerId: string,
    schemaName: string,
  ): Promise<{ id: string; orderNumber: string } | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(`
      SELECT id, order_number AS "orderNumber"
      FROM "${schemaName}".orders
      WHERE customer_id = $1::uuid
        AND status = 'payment_pending'
      ORDER BY created_at DESC
      LIMIT 1
    `, customerId);

    return rows[0] ?? null;
  }
}
