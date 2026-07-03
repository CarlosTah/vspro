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

      // 2.5. DRIVER RESPONSE: Check if sender is a delivery driver with pending assignment
      // Must run BEFORE owner detection so drivers can respond to dispatch messages
      const driverHandled = await this.handleDriverResponse(schema, message);
      if (driverHandled) return;

      // 2.6. OWNER DETECTION: Check if this sender owns a registered tenant
      // Only applies when messaging the VSPRO platform number (tenantSlug === 'vspro')
      const ownerTenant = await this.detectTenantOwner(message.senderId, tenantSlug);
      if (ownerTenant && ownerTenant.slug !== tenantSlug) {
        this.logger.log(`Owner detected: ${message.senderId} → tenant ${ownerTenant.slug} (${ownerTenant.businessName})`);
        // Route this message to the owner's own tenant schema
        await this.processAsOwner(ownerTenant, tenant, message);
        return;
      }

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

      // 5.5. SURVEY RESPONSE: If client sends 1-5 and has a recently delivered order
      if (message.text && /^[1-5]$/.test(message.text.trim())) {
        const recentDelivered = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT id, order_number AS "orderNumber" FROM "${schema}".orders
          WHERE customer_id = $1::uuid AND status = 'delivered'
            AND updated_at > NOW() - INTERVAL '30 minutes'
          ORDER BY updated_at DESC LIMIT 1
        `, customer.id).catch(() => []);

        if (recentDelivered.length > 0) {
          const rating = parseInt(message.text.trim());
          // Save rating
          await this.prisma.$executeRawUnsafe(`
            ALTER TABLE "${schema}".orders ADD COLUMN IF NOT EXISTS customer_rating INTEGER
          `);
          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schema}".orders SET customer_rating = $1 WHERE id = $2::uuid
          `, rating, recentDelivered[0].id);

          // Send thank you
          const thankYou = rating >= 4
            ? `¡Gracias por tu calificación! ⭐${rating} Nos alegra que te haya gustado. ¡Te esperamos pronto! 🙌`
            : `Gracias por tu opinión. Lamentamos que no fue perfecto. Trabajaremos para mejorar. Si tienes algún comentario adicional, escríbenos.`;

          await this.messagingService.sendText(message.channelType, message.senderId, thankYou, schema);
          await this.conversationsService.saveMessage(conversation.id, 'outbound', 'text', thankYou, null, null, schema);
          this.logger.log(`[${schema}] Survey rating ${rating}/5 for ${recentDelivered[0].orderNumber}`);
          return;
        }
      }

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
      if ((['audio', 'voice'] as string[]).includes(message.type) && message.mediaUrl) {
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
      // Inject senderPhone into context so register_business can link the owner
      const enrichedConversation = {
        ...conversation,
        context: { ...conversation.context, customerId: customer.id, senderPhone: message.senderId },
      };
      const aiResponse = await this.aiEngine.processMessage(
        tenant,
        enrichedConversation,
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

  /**
   * Check if the sender is a delivery driver with a pending ('offered') assignment.
   * If they respond with SI/YES → accept assignment.
   * If they respond with NO → reject and trigger reassignment.
   * Returns true if the message was handled as a driver response.
   */
  private async handleDriverResponse(schemaName: string, message: IncomingMessage): Promise<boolean> {
    const text = (message.text ?? '').trim().toLowerCase();
    if (!text) return false;

    // Only handle short responses (SI, NO, ok, listo, etc.)
    if (text.length > 20) return false;

    const normalizedPhone = message.senderId.replace(/^\+/, '');

    try {
      // Check if this phone belongs to a driver in this tenant
      const drivers = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT d.id, d.name FROM "${schemaName}".delivery_drivers d
        WHERE d.phone = $1 OR d.phone = $2 OR d.phone = $3
        LIMIT 1
      `, message.senderId, normalizedPhone, `+${normalizedPhone}`);

      if (drivers.length === 0) return false;

      const driver = drivers[0];

      // Check for active 'offered' assignment for this driver
      const assignments = await this.prisma.$queryRawUnsafe<any[]>(`
        SELECT da.id, da.order_id AS "orderId", da.status,
               o.order_number AS "orderNumber"
        FROM "${schemaName}".delivery_assignments da
        JOIN "${schemaName}".orders o ON o.id = da.order_id
        WHERE da.driver_id = $1::uuid AND da.status = 'offered'
        ORDER BY da.offered_at DESC LIMIT 1
      `, driver.id);

      if (assignments.length === 0) return false;

      const assignment = assignments[0];
      const isAccept = ['si', 'sí', 'yes', 'ok', 'va', 'listo', 'voy', 'acepto', 'claro', 'dale'].includes(text);
      const isReject = ['no', 'nop', 'nel', 'no puedo', 'ocupado', 'paso'].includes(text);

      if (isAccept) {
        // Accept the assignment
        await this.prisma.$executeRawUnsafe(`
          UPDATE "${schemaName}".delivery_assignments
          SET status = 'accepted', accepted_at = NOW()
          WHERE id = $1::uuid
        `, assignment.id);

        this.logger.log(`[${schemaName}] Driver ${driver.name} accepted order ${assignment.orderNumber}`);

        // Save inbound message
        await this.saveDriverMessage(schemaName, assignment.id, driver.id, 'inbound', text);

        // Send confirmation to driver
        const reply = `✅ ¡Aceptado! Pedido #${assignment.orderNumber}. Ve a recogerlo y cuando lo tengas responde "RECOGIDO".`;
        await this.messagingService.sendText(message.channelType, message.senderId, reply, schemaName);
        await this.saveDriverMessage(schemaName, assignment.id, driver.id, 'outbound', reply);
        return true;

      } else if (isReject) {
        // Reject the assignment
        await this.prisma.$executeRawUnsafe(`
          UPDATE "${schemaName}".delivery_assignments
          SET status = 'rejected'
          WHERE id = $1::uuid
        `, assignment.id);

        this.logger.log(`[${schemaName}] Driver ${driver.name} rejected order ${assignment.orderNumber}`);

        await this.saveDriverMessage(schemaName, assignment.id, driver.id, 'inbound', text);

        const reply = `👍 Entendido. Se asignará a otro repartidor.`;
        await this.messagingService.sendText(message.channelType, message.senderId, reply, schemaName);
        await this.saveDriverMessage(schemaName, assignment.id, driver.id, 'outbound', reply);
        return true;
      }

      // Check for "RECOGIDO" / "lo tengo" — driver picked up
      const isPickup = ['recogido', 'lo tengo', 'listo lo llevo', 'ya lo tengo', 'recogi'].includes(text);
      if (isPickup) {
        // Find accepted assignment
        const acceptedAssignments = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT da.id, da.order_id AS "orderId", o.order_number AS "orderNumber"
          FROM "${schemaName}".delivery_assignments da
          JOIN "${schemaName}".orders o ON o.id = da.order_id
          WHERE da.driver_id = $1::uuid AND da.status = 'accepted'
          ORDER BY da.accepted_at DESC LIMIT 1
        `, driver.id);

        if (acceptedAssignments.length > 0) {
          const a = acceptedAssignments[0];
          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schemaName}".delivery_assignments SET status = 'picked_up', picked_up_at = NOW() WHERE id = $1::uuid
          `, a.id);
          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schemaName}".orders SET status = 'shipped', updated_at = NOW() WHERE id = $1::uuid
          `, a.orderId);

          this.logger.log(`[${schemaName}] Driver ${driver.name} picked up order ${a.orderNumber}`);

          await this.saveDriverMessage(schemaName, a.id, driver.id, 'inbound', text);
          const reply = `📦 Perfecto. Pedido #${a.orderNumber} en camino. Cuando lo entregues responde "ENTREGADO".`;
          await this.messagingService.sendText(message.channelType, message.senderId, reply, schemaName);
          await this.saveDriverMessage(schemaName, a.id, driver.id, 'outbound', reply);
          return true;
        }
      }

      // Check for "ENTREGADO" — driver delivered
      const isDelivered = ['entregado', 'entregue', 'listo entregado', 'ya lo entregue', 'entregué'].includes(text);
      if (isDelivered) {
        const pickedUpAssignments = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT da.id, da.order_id AS "orderId", o.order_number AS "orderNumber"
          FROM "${schemaName}".delivery_assignments da
          JOIN "${schemaName}".orders o ON o.id = da.order_id
          WHERE da.driver_id = $1::uuid AND da.status = 'picked_up'
          ORDER BY da.picked_up_at DESC LIMIT 1
        `, driver.id);

        if (pickedUpAssignments.length > 0) {
          const a = pickedUpAssignments[0];
          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schemaName}".delivery_assignments SET status = 'delivered', delivered_at = NOW() WHERE id = $1::uuid
          `, a.id);
          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schemaName}".orders SET status = 'delivered', updated_at = NOW() WHERE id = $1::uuid
          `, a.orderId);

          this.logger.log(`[${schemaName}] Driver ${driver.name} delivered order ${a.orderNumber}`);

          await this.saveDriverMessage(schemaName, a.id, driver.id, 'inbound', text);
          const reply = `✅ ¡Entrega confirmada! Pedido #${a.orderNumber} completado. ¡Gracias! 🙌`;
          await this.messagingService.sendText(message.channelType, message.senderId, reply, schemaName);
          await this.saveDriverMessage(schemaName, a.id, driver.id, 'outbound', reply);
          return true;
        }
      }
    } catch {
      // If tables don't exist, not a driver
    }

    return false;
  }

  /**
   * Save a message in the delivery_messages table for history tracking.
   */
  private async saveDriverMessage(schemaName: string, assignmentId: string, driverId: string, direction: string, content: string): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".delivery_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          assignment_id UUID, driver_id UUID,
          direction VARCHAR(10) NOT NULL DEFAULT 'outbound',
          content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "${schemaName}".delivery_messages (assignment_id, driver_id, direction, content)
        VALUES ($1::uuid, $2::uuid, $3, $4)
      `, assignmentId, driverId, direction, content);
    } catch {}
  }

  /**
   * Detects if a phone number belongs to a registered tenant owner.
   * Checks the users table of all active/trial tenants for admin users with matching phone.
   */
  private async detectTenantOwner(
    senderPhone: string,
    currentTenantSlug: string,
  ): Promise<{ id: string; slug: string; schemaName: string; businessName: string; status: string } | null> {
    // Only do owner detection when messaging the VSPRO platform
    if (currentTenantSlug !== 'vspro') return null;

    // Normalize phone (remove + prefix for matching)
    const normalizedPhone = senderPhone.replace(/^\+/, '');

    // Look for this phone in tenant owner data
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'TRIAL'] }, slug: { not: 'vspro' } },
      select: { id: true, slug: true, schemaName: true, businessName: true, status: true },
    });

    for (const t of tenants) {
      try {
        // Check if phone column exists first
        const colCheck = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'users' AND column_name = 'phone'
        `, t.schemaName);

        if (colCheck.length === 0) continue;

        const users = await this.prisma.$queryRawUnsafe<any[]>(`
          SELECT phone FROM "${t.schemaName}".users
          WHERE role = 'admin' AND phone IS NOT NULL
            AND (phone = $1 OR phone = $2 OR phone = $3)
          LIMIT 1
        `, senderPhone, normalizedPhone, `+${normalizedPhone}`);

        if (users.length > 0) return t;
      } catch {
        // Schema might not have users table yet, skip
      }
    }

    return null;
  }

  /**
   * Process a message from a tenant owner — routes to their own schema
   * with admin context so Max can add products, configure things, etc.
   */
  private async processAsOwner(
    ownerTenant: { id: string; slug: string; schemaName: string; businessName: string; status: string },
    platformTenant: any,
    message: IncomingMessage,
  ): Promise<void> {
    const schema = ownerTenant.schemaName;

    // Find or create the owner as a customer in their OWN schema (for conversation tracking)
    const customer = await this.customersService.findOrCreateByChannel(
      message.channelType,
      message.senderId,
      message.senderName ?? 'Dueño',
      schema,
    );

    // Find or create conversation in their schema
    const conversation = await this.conversationsService.findOrCreate(
      customer.id,
      message.channelType,
      message.messageId,
      schema,
    );

    // Save inbound message
    await this.conversationsService.saveMessage(
      conversation.id, 'inbound', message.type, message.text ?? null,
      message.mediaUrl ?? null, message.messageId, schema,
    );

    // Process with AI using THEIR schema (so add_product, etc. works on their data)
    // The AI will have access to their products, orders, etc.
    const fullTenant = await this.prisma.tenant.findUnique({
      where: { id: ownerTenant.id },
      include: { plan: true },
    });

    const aiResponse = await this.aiEngine.processMessage(
      fullTenant,
      { ...conversation, context: { ...conversation.context, isOwner: true, customerId: customer.id } },
      message,
      schema,
    );

    // Send response
    if (aiResponse.text) {
      await this.messagingService.sendText(
        message.channelType,
        message.senderId,
        aiResponse.text,
        platformTenant.schemaName, // Send FROM the VSPRO WhatsApp number
      );

      await this.conversationsService.saveMessage(
        conversation.id, 'outbound', 'text', aiResponse.text, null, null, schema,
      );
    }

    // Update context
    if (aiResponse.updatedContext) {
      await this.conversationsService.updateContext(conversation.id, aiResponse.updatedContext, schema);
    }

    this.logger.log(`Owner message processed: ${message.senderId} → ${ownerTenant.slug}`);
  }
}
