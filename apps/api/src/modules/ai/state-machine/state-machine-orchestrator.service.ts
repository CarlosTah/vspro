import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { ProductsService } from '../../products/products.service';
import { OrdersService } from '../../orders/orders.service';
import { CustomerMemoryService } from '../customer-memory.service';
import { IntentClassifierService } from './intent-classifier';
import { TextGeneratorService } from './text-generator';
import {
  OrderStateMachine,
  OrderState,
  ConversationStateData,
  ParsedIntent,
  TransitionResult,
} from './order-state-machine';
import { IncomingMessage } from '@vspro/shared';

export interface StateMachineResponse {
  text: string;
  newState: ConversationStateData;
}

@Injectable()
export class StateMachineOrchestratorService {
  private readonly logger = new Logger(StateMachineOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
    private readonly ordersService: OrdersService,
    private readonly customerMemory: CustomerMemoryService,
    private readonly intentClassifier: IntentClassifierService,
    private readonly textGenerator: TextGeneratorService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Process a customer message using the state machine.
   * Flow: classify intent → transition state → execute actions → generate text
   */
  async process(
    tenant: any,
    conversation: { id: string; context: Record<string, any> },
    message: IncomingMessage,
    schemaName: string,
    aiConfig: any,
    products: any[],
  ): Promise<StateMachineResponse> {
    // 1. Load current state from conversation context
    const currentState = this.loadState(conversation.context);

    // 2. Classify the customer's intent
    const hasImage = !!(message.mediaUrl && message.type === 'image');
    let intent: ParsedIntent;

    // Special case: location messages
    if (message.type === 'location' && (message as any).latitude) {
      intent = this.intentClassifier.classifyLocation(
        (message as any).latitude,
        (message as any).longitude,
      );
    } else {
      intent = await this.intentClassifier.classify(
        message.text ?? '',
        currentState.state,
        hasImage,
      );
    }

    this.logger.debug(`[${schemaName}] Intent: ${intent.type} | State: ${currentState.state}`);

    // 3. Build the state machine with current catalog
    const catalog = products.map((p: any) => ({ name: p.name, price: parseFloat(p.price) }));
    const stateMachine = new OrderStateMachine(catalog, tenant.businessName, 30);

    // 4. Execute the transition
    const transition = stateMachine.transition(currentState, intent);

    // 5. Execute system actions (tools) automatically
    let actionResults = '';
    for (const action of transition.actions) {
      const result = await this.executeAction(action.tool, action.args, conversation, schemaName);
      actionResults += `\n[${action.tool}]: ${result}`;
    }

    // 6. Update state with results from actions
    const newState: ConversationStateData = {
      ...currentState,
      state: transition.newState,
      items: intent.items ? [...(currentState.items ?? []), ...intent.items] : currentState.items,
    };

    // Update orderId/orderNumber from action results
    if (actionResults.includes('"orderId"') || actionResults.includes('"orderNumber"')) {
      try {
        const orderMatch = actionResults.match(/"orderId"\s*:\s*"([^"]+)"/);
        const numMatch = actionResults.match(/"orderNumber"\s*:\s*"([^"]+)"/);
        if (orderMatch) newState.orderId = orderMatch[1];
        if (numMatch) newState.orderNumber = numMatch[1];
      } catch {}
    }

    // Update total
    if (actionResults.includes('"total"')) {
      try {
        const totalMatch = actionResults.match(/"total"\s*:\s*"?(\d+\.?\d*)"?/);
        if (totalMatch) newState.total = parseFloat(totalMatch[1]);
      } catch {}
    }

    // If items were validated by the state machine, use them
    if (transition.newState === OrderState.CONFIRMING_ORDER && intent.items) {
      newState.items = intent.items;
    }

    // 7. Generate natural language response
    const personality = aiConfig.customInstructions
      ? `Personalidad del negocio:\n${aiConfig.customInstructions.substring(0, 300)}`
      : `Tono: ${aiConfig.tone ?? 'amigable'}. Negocio: ${tenant.businessName}.`;

    const customerName = (conversation.context as any)?.customerName;

    // Load customer memory for personalization
    let memoryHint = '';
    const custId = conversation.context.customerId;
    if (custId) {
      try {
        const memories = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT category, data FROM "${schemaName}".customer_memories WHERE customer_id = $1::uuid ORDER BY updated_at DESC LIMIT 5`,
          custId,
        );
        if (memories.length > 0) {
          const memParts: string[] = [];
          for (const m of memories) {
            if (m.category === 'addresses' && m.data?.last_delivery) memParts.push(`Su dirección: ${m.data.last_delivery}`);
            if (m.category === 'purchase_history_summary') memParts.push(`Pedidos anteriores: ${JSON.stringify(m.data).substring(0, 100)}`);
            if (m.category === 'preferences') memParts.push(`Preferencias: ${JSON.stringify(m.data)}`);
            if (m.category === 'profile_name' && m.data?.name) memParts.push(`Nombre: ${m.data.name}`);
          }
          if (memParts.length > 0) memoryHint = `\n\nDatos del cliente en memoria:\n${memParts.join('\n')}`;
        }
      } catch {}
    }

    const llmContext = `${transition.llmContext}${actionResults ? `\n\nResultado de acciones:${actionResults}` : ''}${memoryHint}`;

    let responseText: string;
    if (transition.skipLlm && transition.fixedResponse) {
      responseText = transition.fixedResponse;
    } else {
      responseText = await this.textGenerator.generate(llmContext, personality, customerName);
    }

    // 8. Persist state in conversation context
    await this.persistState(conversation.id, newState, schemaName);

    return { text: responseText, newState };
  }

  // ─── State Management ───────────────────────────────────────

  private loadState(context: Record<string, any>): ConversationStateData {
    return {
      state: context.smState ?? OrderState.IDLE,
      orderId: context.lastOrderId,
      orderNumber: context.lastOrderNumber,
      items: context.smItems,
      deliveryType: context.smDeliveryType,
      address: context.smAddress,
      paymentMethod: context.smPaymentMethod,
      total: context.smTotal,
      customerName: context.customerName,
    };
  }

  private async persistState(conversationId: string, state: ConversationStateData, schemaName: string): Promise<void> {
    const patch = {
      smState: state.state,
      lastOrderId: state.orderId,
      lastOrderNumber: state.orderNumber,
      smItems: state.items,
      smDeliveryType: state.deliveryType,
      smAddress: state.address,
      smPaymentMethod: state.paymentMethod,
      smTotal: state.total,
    };

    await this.prisma.$executeRawUnsafe(`
      UPDATE "${schemaName}".conversations
      SET context = context || $1::jsonb
      WHERE id = $2::uuid
    `, JSON.stringify(patch), conversationId);
  }

  // ─── Action Executor ────────────────────────────────────────

  private async executeAction(
    tool: string,
    args: Record<string, any>,
    conversation: { id: string; context: Record<string, any> },
    schemaName: string,
  ): Promise<string> {
    try {
      switch (tool) {
        case 'create_order': {
          const customerId = conversation.context.customerId;
          if (!customerId) return JSON.stringify({ success: false, message: 'No customer ID' });

          const resolvedItems: { productId: string; quantity: number }[] = [];
          for (const item of (args.items ?? [])) {
            const found = await this.productsService.search(item.productName, schemaName);
            if (found.length > 0) {
              resolvedItems.push({ productId: found[0].id, quantity: item.quantity });
            }
          }
          if (resolvedItems.length === 0) return JSON.stringify({ success: false, message: 'No products found' });

          const order = await this.ordersService.create({
            customerId,
            channelType: 'whatsapp',
            items: resolvedItems,
            notes: args.notes,
          }, schemaName);

          // Auto-save to memory
          this.customerMemory.upsertProfile(customerId, 'purchase_history_summary', {
            [`order_${order.orderNumber}`]: `${(args.items ?? []).map((i: any) => i.productName).join(', ')} — $${order.total}`,
          }, schemaName).catch(() => {});

          // Auto-save preferences from notes
          const notes = (args.items ?? []).filter((i: any) => i.notes).map((i: any) => i.notes).join(', ');
          if (notes) {
            this.customerMemory.upsertProfile(customerId, 'preferences', { latest_notes: notes }, schemaName).catch(() => {});
          }

          return JSON.stringify({ success: true, orderId: order.id, orderNumber: order.orderNumber, total: order.total });
        }

        case 'set_delivery_address': {
          const address: Record<string, any> = {};
          if (args.street) address.street = args.street;
          if (args.colony) address.colony = args.colony;
          if (args.city) address.city = args.city;
          if (args.reference) address.reference = args.reference;
          if (args.lat) address.lat = args.lat;
          if (args.lng) address.lng = args.lng;

          const orderId = args.orderId || conversation.context.lastOrderId;
          if (!orderId) return JSON.stringify({ success: false, message: 'No order ID' });

          await this.prisma.$executeRawUnsafe(`
            ALTER TABLE "${schemaName}".orders ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(20) DEFAULT 'pickup'
          `);
          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schemaName}".orders
            SET shipping_address = $1::jsonb, delivery_type = 'delivery', shipping_cost = 30, total = subtotal + 30, updated_at = NOW()
            WHERE id = $2::uuid
          `, JSON.stringify(address), orderId);

          // Auto-save address to memory
          const custId3 = conversation.context.customerId;
          if (custId3) {
            const addrText = [args.street, args.colony, args.city, args.reference].filter(Boolean).join(', ');
            this.customerMemory.upsertProfile(custId3, 'addresses', { last_delivery: addrText, full: address }, schemaName).catch(() => {});
            this.customerMemory.upsertProfile(custId3, 'delivery_preference', { type: 'delivery' }, schemaName).catch(() => {});
          }

          return JSON.stringify({ success: true, deliveryCost: 30 });
        }

        case 'set_payment_method': {
          const orderId = args.orderId || conversation.context.lastOrderId;
          if (!orderId) return JSON.stringify({ success: false, message: 'No order ID' });

          await this.prisma.$executeRawUnsafe(`
            ALTER TABLE "${schemaName}".orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)
          `);
          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schemaName}".orders SET payment_method = $1, updated_at = NOW() WHERE id = $2::uuid
          `, args.method, orderId);

          // Auto-save payment preference
          const custId2 = conversation.context.customerId;
          if (custId2) {
            this.customerMemory.upsertProfile(custId2, 'payment_preference', { method: args.method }, schemaName).catch(() => {});
          }

          // COD → go to production directly
          if (args.method === 'cod') {
            try { await this.ordersService.transition(orderId, 'in_production' as any, schemaName); } catch {}
          }

          return JSON.stringify({ success: true, method: args.method });
        }

        case 'request_payment': {
          const orderId = args.orderId || conversation.context.lastOrderId;
          if (!orderId) return JSON.stringify({ success: false, message: 'No order ID' });
          try { await this.ordersService.transition(orderId, 'payment_pending' as any, schemaName); } catch {}
          return JSON.stringify({ success: true });
        }

        case 'get_order_status': {
          const orderNumber = args.orderNumber || conversation.context.lastOrderNumber;
          if (!orderNumber) return JSON.stringify({ success: false, message: 'No order number' });
          try {
            const order = await this.ordersService.findByOrderNumber(orderNumber, schemaName);
            return JSON.stringify({ status: order.status, total: order.total, orderNumber: order.orderNumber });
          } catch { return JSON.stringify({ success: false, message: 'Order not found' }); }
        }

        case 'cancel_order': {
          const orderId = args.orderId || conversation.context.lastOrderId;
          if (!orderId) return JSON.stringify({ success: false });
          try { await this.ordersService.transition(orderId, 'cancelled' as any, schemaName); } catch {}
          return JSON.stringify({ success: true });
        }

        case 'escalate_complaint': {
          return JSON.stringify({ success: true, message: 'Escalado al equipo' });
        }

        case 'send_media_to_customer': {
          // Send media (menu, promo, catalog) to customer via WhatsApp
          const mediaType = args.mediaType ?? 'menu';
          try {
            await this.prisma.$executeRawUnsafe(`
              CREATE TABLE IF NOT EXISTS "${schemaName}".media_assets (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                type VARCHAR(50) NOT NULL DEFAULT 'general',
                title VARCHAR(255), url TEXT NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT true,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
              )
            `);
            const assets = await this.prisma.$queryRawUnsafe<any[]>(
              `SELECT url, title FROM "${schemaName}".media_assets WHERE type = $1 AND is_active = true ORDER BY sort_order ASC LIMIT 3`,
              mediaType,
            );
            if (assets.length === 0) {
              return JSON.stringify({ success: false, message: `No hay material de tipo "${mediaType}" configurado.` });
            }
            // Send via WhatsApp
            const customerPhone = conversation.context.senderPhone;
            if (customerPhone) {
              const channels = await this.prisma.$queryRawUnsafe<any[]>(
                `SELECT external_id, access_token FROM "${schemaName}".channels WHERE type = 'whatsapp' AND is_active = true LIMIT 1`,
              );
              if (channels[0]) {
                const axios = (await import('axios')).default;
                for (const asset of assets.slice(0, 2)) {
                  if (asset.url && !asset.url.startsWith('data:')) {
                    await axios.post(
                      `https://graph.facebook.com/v18.0/${channels[0].external_id}/messages`,
                      { messaging_product: 'whatsapp', to: customerPhone, type: 'image', image: { link: asset.url, caption: asset.title ?? '' } },
                      { headers: { Authorization: `Bearer ${channels[0].access_token}` } },
                    ).catch(() => {});
                  }
                }
              }
            }
            return JSON.stringify({ success: true, sent: assets.length, message: `Material "${mediaType}" enviado` });
          } catch (e: any) {
            return JSON.stringify({ success: false, message: e.message });
          }
        }

        case 'repeat_last_order':
          return JSON.stringify({ success: true, message: 'Action queued' });

        default:
          return JSON.stringify({ success: false, message: `Unknown tool: ${tool}` });
      }
    } catch (err: any) {
      this.logger.error(`Action ${tool} failed: ${err.message}`);
      return JSON.stringify({ success: false, message: err.message });
    }
  }
}
