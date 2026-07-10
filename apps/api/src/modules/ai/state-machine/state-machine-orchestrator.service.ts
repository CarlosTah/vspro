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
    } else if (message.text && message.text.includes('maps.google.com/?q=')) {
      // WhatsApp sometimes sends location as a URL text message
      const coordMatch = message.text.match(/q=([-\d.]+),([-\d.]+)/);
      if (coordMatch) {
        intent = this.intentClassifier.classifyLocation(parseFloat(coordMatch[1]), parseFloat(coordMatch[2]));
      } else {
        intent = await this.intentClassifier.classify(message.text, currentState.state, hasImage);
      }
    } else {
      intent = await this.intentClassifier.classify(
        message.text ?? '',
        currentState.state,
        hasImage,
      );
    }

    this.logger.log(`[${schemaName}] SM: ${currentState.state} → ${intent.type} | msg: "${(message.text ?? '').substring(0, 40)}"`);

    // Detect if message contains a name introduction (Soy X, Me llamo X, Mi nombre es X)
    const nameMatch = (message.text ?? '').match(/(?:soy|me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑa-záéíóúñ]+)?)/i);
    if (nameMatch && nameMatch[1] && nameMatch[1].length > 2) {
      const detectedName = nameMatch[1].trim();
      // Update customer name in DB
      const custId = conversation.context.customerId;
      if (custId) {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "${schemaName}".customers SET name = $1 WHERE id = $2::uuid`,
          detectedName, custId,
        ).catch(() => {});
        // Also save in memory
        this.customerMemory.upsertProfile(custId, 'profile_name', { name: detectedName }, schemaName).catch(() => {});
        // Update local state for this message
        currentState.customerName = detectedName;
        (conversation.context as any).customerName = detectedName;
      }
    }

    // 3. Build the state machine with current catalog
    const catalog = products.map((p: any) => ({ name: p.name, price: parseFloat(p.price) }));
    // Load delivery cost from config (default $30)
    let deliveryCost = 30;
    try {
      const costRows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT agent_config->'deliverySettings'->'shippingCost' AS cost FROM "${schemaName}".ai_config LIMIT 1`,
      );
      const cfgCost = costRows[0]?.cost;
      if (cfgCost && !isNaN(parseFloat(String(cfgCost)))) deliveryCost = parseFloat(String(cfgCost));
    } catch {}

    const stateMachine = new OrderStateMachine(catalog, tenant.businessName, deliveryCost);

    // 4. Execute the transition
    const transition = stateMachine.transition(currentState, intent);

    this.logger.log(`[${schemaName}] SM: → ${transition.newState} | actions: ${transition.actions.map(a => a.tool).join(',') || 'none'}`);

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
    };

    // Reset items when transitioning to IDLE or starting a new order
    if (transition.newState === OrderState.IDLE || 
        (transition.newState === OrderState.TAKING_ORDER && currentState.state === OrderState.IDLE) ||
        (transition.newState === OrderState.TAKING_ORDER && currentState.state === OrderState.ORDER_COMPLETE)) {
      newState.items = undefined;
      newState.orderId = undefined;
      newState.orderNumber = undefined;
      newState.total = undefined;
    } else if (transition.newState === OrderState.CONFIRMING_ORDER) {
      // Determine items for the confirming state
      if (intent.items && intent.items.length > 0) {
        const catalog2 = products.map((p: any) => ({ name: p.name, price: parseFloat(p.price) }));
        const smTemp = new OrderStateMachine(catalog2, '', deliveryCost);
        const validated2 = (smTemp as any).validateItems(intent.items);
        
        // If coming FROM CONFIRMING_ORDER (customer adding more items), MERGE with existing
        if (currentState.state === OrderState.CONFIRMING_ORDER && currentState.items && currentState.items.length > 0) {
          newState.items = [...currentState.items, ...validated2.valid];
        } else {
          // Fresh confirmation from TAKING_ORDER or IDLE — use only new items
          newState.items = validated2.valid;
        }
      } else if (currentState.items) {
        newState.items = currentState.items;
      }
      // Calculate total from items
      if (newState.items && newState.items.length > 0) {
        newState.total = newState.items.reduce((sum, item: any) => {
          const price = item.price ?? catalog.find(p => p.name.toLowerCase() === (item.productName || '').toLowerCase())?.price ?? 0;
          return sum + (price * item.quantity);
        }, 0);
      }
    } else {
      newState.items = currentState.items;
      // Keep total from current state
      if (!newState.total && currentState.total) newState.total = currentState.total;
    }

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
          `SELECT profile FROM "${schemaName}".customer_memories WHERE customer_id = $1::uuid LIMIT 1`,
          custId,
        );
        if (memories.length > 0 && memories[0].profile) {
          const profile = memories[0].profile;
          const memParts: string[] = [];
          if (profile.addresses?.last_delivery) memParts.push(`Su dirección: ${profile.addresses.last_delivery}`);
          if (profile.addresses?.name) memParts.push(`Nombre: ${profile.addresses.name}`);
          if (profile.preferences) memParts.push(`Preferencias: ${JSON.stringify(profile.preferences)}`);
          if (memParts.length > 0) memoryHint = `\n\nDatos del cliente en memoria:\n${memParts.join('\n')}`;
        }
      } catch {}
    }

    const llmContext = `${transition.llmContext}${actionResults ? `\n\nResultado de acciones:${actionResults}` : ''}${memoryHint}`;

    let responseText: string;
    if (transition.skipLlm && transition.fixedResponse) {
      responseText = transition.fixedResponse;
    } else {
      // Special case: DELIVERY_ASK_ADDRESS — build deterministic response with stored address
      if (transition.llmContext.startsWith('DELIVERY_ASK_ADDRESS|')) {
        const totalWithShip = transition.llmContext.split('|')[1];
        let storedAddress = '';
        if (custId) {
          try {
            const memProfile = await this.prisma.$queryRawUnsafe<any[]>(
              `SELECT profile->'addresses'->>'last_delivery' AS addr FROM "${schemaName}".customer_memories WHERE customer_id = $1::uuid LIMIT 1`,
              custId,
            );
            storedAddress = memProfile[0]?.addr ?? '';
          } catch {}
        }
        if (storedAddress) {
          responseText = `El envío cuesta $${deliveryCost}. Total con envío: $${totalWithShip}.\n\n¿Te lo enviamos a *${storedAddress}* o a otra dirección? 📍`;
        } else {
          responseText = `El envío cuesta $${deliveryCost}. Total con envío: $${totalWithShip}.\n\nPor favor, envíame tu dirección completa (calle, colonia, referencias) y tu ubicación 📍.`;
        }
      } else {
        // IMPORTANT: Only pass memory hint to LLM when NOT showing items/totals
        // to prevent the LLM from confusing addresses with products
        const safeMemory = (transition.newState === OrderState.SETTING_ADDRESS || 
                            transition.newState === OrderState.ASKING_DELIVERY)
          ? memoryHint : '';
        const safeLlmContext = `${transition.llmContext}${actionResults ? `\n\nResultado de acciones:${actionResults}` : ''}${safeMemory}`;
        responseText = await this.textGenerator.generate(safeLlmContext, personality, customerName);
      }
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

          // If no GPS coordinates provided, try to get from memory/previous orders
          if (!address.lat || !address.lng) {
            const custIdAddr = conversation.context.customerId;
            if (custIdAddr) {
              try {
                // Check memory for stored coordinates
                const memAddr = await this.prisma.$queryRawUnsafe<any[]>(
                  `SELECT profile->'addresses'->'full' AS full_addr FROM "${schemaName}".customer_memories WHERE customer_id = $1::uuid LIMIT 1`,
                  custIdAddr,
                );
                if (memAddr[0]?.full_addr?.lat) {
                  address.lat = memAddr[0].full_addr.lat;
                  address.lng = memAddr[0].full_addr.lng;
                }
                // If not in memory, check last order with GPS
                if (!address.lat) {
                  const lastGps = await this.prisma.$queryRawUnsafe<any[]>(
                    `SELECT shipping_address FROM "${schemaName}".orders WHERE customer_id = $1::uuid AND shipping_address IS NOT NULL AND (shipping_address->>'lat') IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
                    custIdAddr,
                  );
                  if (lastGps[0]?.shipping_address?.lat) {
                    address.lat = lastGps[0].shipping_address.lat;
                    address.lng = lastGps[0].shipping_address.lng;
                  }
                }
              } catch {}
            }
          }

          const orderId = args.orderId || conversation.context.lastOrderId;
          if (!orderId) return JSON.stringify({ success: false, message: 'No order ID' });

          await this.prisma.$executeRawUnsafe(`
            ALTER TABLE "${schemaName}".orders ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(20) DEFAULT 'pickup'
          `);

          // Get dynamic delivery cost
          let shipCost = 30;
          try {
            const costRows = await this.prisma.$queryRawUnsafe<any[]>(
              `SELECT agent_config->'deliverySettings'->'shippingCost' AS cost FROM "${schemaName}".ai_config LIMIT 1`,
            );
            const c = costRows[0]?.cost;
            if (c && !isNaN(parseFloat(String(c)))) shipCost = parseFloat(String(c));
          } catch {}

          await this.prisma.$executeRawUnsafe(`
            UPDATE "${schemaName}".orders
            SET shipping_address = $1::jsonb, delivery_type = 'delivery', shipping_cost = ${shipCost}, total = subtotal + ${shipCost}, updated_at = NOW()
            WHERE id = $2::uuid
          `, JSON.stringify(address), orderId);

          // Auto-save address to memory (including GPS if available)
          const custId3 = conversation.context.customerId;
          if (custId3) {
            const addrText = [args.street, args.colony, args.city, args.reference].filter(Boolean).join(', ');
            this.customerMemory.upsertProfile(custId3, 'addresses', { last_delivery: addrText || address.street, full: address }, schemaName).catch(() => {});
            this.customerMemory.upsertProfile(custId3, 'delivery_preference', { type: 'delivery' }, schemaName).catch(() => {});
          }

          return JSON.stringify({ success: true, deliveryCost: shipCost });
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
          // Notify the owner via WhatsApp with complaint details
          try {
            const orderId = conversation.context.lastOrderId;
            const orderNum = conversation.context.lastOrderNumber;
            const custName = conversation.context.customerName ?? 'Cliente';
            const custPhone = conversation.context.senderPhone ?? '';
            
            // Get ALL admin phones
            const admins = await this.prisma.$queryRawUnsafe<any[]>(
              `SELECT phone FROM "${schemaName}".users WHERE role = 'admin' AND phone IS NOT NULL`,
            );
            
            // Find an admin whose phone is DIFFERENT from the sender
            const targetAdmin = admins.find(a => {
              const adminPhone = String(a.phone).replace(/\D/g, '');
              const senderClean = String(custPhone).replace(/\D/g, '');
              return adminPhone !== senderClean && !senderClean.endsWith(adminPhone) && !adminPhone.endsWith(senderClean);
            }) || admins[0]; // fallback to first admin if no different one found
            
            if (targetAdmin?.phone && targetAdmin.phone !== custPhone) {
              const complaintMsg = `⚠️ *QUEJA DE CLIENTE*\n\n👤 ${custName} (${custPhone})\n📋 Pedido: ${orderNum ?? 'N/A'}\n💬 Problema: "${args.reason}"\n\nResponde al cliente desde el dashboard o contacta directamente.`;
              
              // Send to owner via WhatsApp
              const channels = await this.prisma.$queryRawUnsafe<any[]>(
                `SELECT external_id, access_token FROM "${schemaName}".channels WHERE type = 'whatsapp' AND is_active = true LIMIT 1`,
              );
              if (channels[0]) {
                const axios = (await import('axios')).default;
                await axios.post(
                  `https://graph.facebook.com/v18.0/${channels[0].external_id}/messages`,
                  { messaging_product: 'whatsapp', to: targetAdmin.phone, type: 'text', text: { body: complaintMsg } },
                  { headers: { Authorization: `Bearer ${channels[0].access_token}` } },
                ).catch((e) => this.logger.warn(`Failed to send complaint to owner: ${e.message}`));
              }
            } else {
              this.logger.warn(`[${schemaName}] Cannot escalate complaint: owner phone same as sender or no admin found`);
            }
            
            // ALWAYS add note to order regardless of notification success
            if (orderId) {
              await this.prisma.$executeRawUnsafe(
                `UPDATE "${schemaName}".orders SET notes = COALESCE(notes, '') || E'\n' || $1, updated_at = NOW() WHERE id = $2::uuid`,
                `[QUEJA ${new Date().toLocaleDateString()}] ${args.reason}`, orderId,
              ).catch(() => {});
            }
          } catch (e: any) {
            this.logger.error(`escalate_complaint failed: ${e.message}`);
          }
          
          return JSON.stringify({ success: true, message: 'Queja escalada al dueño y registrada en el pedido' });
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
              return JSON.stringify({ success: false, message: `No hay material de tipo "${mediaType}" configurado. El dueño debe subir imágenes en Configuración > Media.` });
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
                  } else {
                    // base64 image — log warning, cannot send via link
                    this.logger.warn(`[${schemaName}] Cannot send base64 media asset to WhatsApp. Upload to CDN first.`);
                  }
                }
              }
            }
            return JSON.stringify({ success: true, sent: assets.length, message: `Material "${mediaType}" enviado` });
          } catch (e: any) {
            return JSON.stringify({ success: false, message: e.message });
          }
        }

        case 'repeat_last_order': {
          const custId4 = conversation.context.customerId;
          if (!custId4) return JSON.stringify({ success: false, message: 'No customer ID' });
          try {
            const lastOrders = await this.prisma.$queryRawUnsafe<any[]>(
              `SELECT id, order_number AS "orderNumber", items, total FROM "${schemaName}".orders WHERE customer_id = $1::uuid AND status IN ('delivered','payment_verified','ready','shipped') ORDER BY created_at DESC LIMIT 1`,
              custId4,
            );
            if (lastOrders.length === 0) return JSON.stringify({ success: false, message: 'No hay pedidos anteriores' });
            const lastOrder = lastOrders[0];
            const items = typeof lastOrder.items === 'string' ? JSON.parse(lastOrder.items) : lastOrder.items;
            const summary = items.map((i: any) => `${i.quantity}x ${i.productName}`).join(', ');
            return JSON.stringify({ success: true, lastOrderNumber: lastOrder.orderNumber, items, total: lastOrder.total, summary });
          } catch { return JSON.stringify({ success: false, message: 'Error al buscar pedido anterior' }); }
        }

        default:
          return JSON.stringify({ success: false, message: `Unknown tool: ${tool}` });
      }
    } catch (err: any) {
      this.logger.error(`Action ${tool} failed: ${err.message}`);
      return JSON.stringify({ success: false, message: err.message });
    }
  }
}
