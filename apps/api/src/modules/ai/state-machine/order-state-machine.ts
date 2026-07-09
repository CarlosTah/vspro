/**
 * Order State Machine — Deterministic flow controller.
 * The LLM does NOT decide transitions. This code does.
 * The LLM only generates natural language text for each state.
 */

// ─── States ─────────────────────────────────────────────────────

export enum OrderState {
  IDLE = 'idle',                         // No active order, waiting for customer
  TAKING_ORDER = 'taking_order',         // Customer is selecting products
  CONFIRMING_ORDER = 'confirming_order', // System asks "is this correct?"
  ASKING_DELIVERY = 'asking_delivery',   // "Pickup or delivery?"
  SETTING_ADDRESS = 'setting_address',   // Waiting for address
  ASKING_PAYMENT = 'asking_payment',     // "Transfer or COD?"
  PROCESSING_PAYMENT = 'processing_payment', // Waiting for payment proof
  ORDER_COMPLETE = 'order_complete',     // Order submitted to kitchen
  CHECKING_STATUS = 'checking_status',   // Customer asking about existing order
}

// ─── Intents (what the customer wants) ──────────────────────────

export type IntentType =
  | 'greeting'
  | 'want_to_order'
  | 'add_items'
  | 'confirm_yes'
  | 'confirm_no'
  | 'modify_order'
  | 'want_delivery'
  | 'want_pickup'
  | 'give_address'
  | 'give_location'
  | 'want_cod'
  | 'want_transfer'
  | 'payment_proof'
  | 'check_status'
  | 'check_menu'
  | 'cancel'
  | 'complaint'
  | 'repeat_order'
  | 'other';

export interface ParsedIntent {
  type: IntentType;
  items?: Array<{ productName: string; quantity: number; notes?: string }>;
  address?: { street?: string; colony?: string; city?: string; reference?: string };
  location?: { lat: number; lng: number };
  orderNumber?: string;
  text: string; // original message
}

// ─── System Actions (what the system executes) ──────────────────

export interface SystemAction {
  tool: string;
  args: Record<string, any>;
}

// ─── Transition Result ──────────────────────────────────────────

export interface TransitionResult {
  newState: OrderState;
  actions: SystemAction[];           // Tools to execute automatically
  llmContext: string;                // What to tell the LLM to generate
  skipLlm?: boolean;                 // If true, use a fixed response (no LLM call needed)
  fixedResponse?: string;            // Fixed response when skipLlm is true
}

// ─── Conversation State ─────────────────────────────────────────

export interface ConversationStateData {
  state: OrderState;
  orderId?: string;
  orderNumber?: string;
  items?: Array<{ productName: string; quantity: number; notes?: string }>;
  deliveryType?: 'pickup' | 'delivery';
  address?: Record<string, any>;
  paymentMethod?: string;
  total?: number;
  customerName?: string;
}

// ─── State Machine Engine ───────────────────────────────────────

export class OrderStateMachine {
  constructor(
    private readonly catalog: Array<{ name: string; price: number }>,
    private readonly businessName: string,
    private readonly deliveryCost: number = 30,
  ) {}

  /**
   * Process a transition based on current state + detected intent.
   * Returns: new state, actions to execute, and context for the LLM redactor.
   */
  transition(currentState: ConversationStateData, intent: ParsedIntent): TransitionResult {
    const state = currentState.state;

    switch (state) {
      case OrderState.IDLE:
        return this.handleIdle(currentState, intent);
      case OrderState.TAKING_ORDER:
        return this.handleTakingOrder(currentState, intent);
      case OrderState.CONFIRMING_ORDER:
        return this.handleConfirming(currentState, intent);
      case OrderState.ASKING_DELIVERY:
        return this.handleAskingDelivery(currentState, intent);
      case OrderState.SETTING_ADDRESS:
        return this.handleSettingAddress(currentState, intent);
      case OrderState.ASKING_PAYMENT:
        return this.handleAskingPayment(currentState, intent);
      case OrderState.PROCESSING_PAYMENT:
        return this.handleProcessingPayment(currentState, intent);
      case OrderState.ORDER_COMPLETE:
        return this.handleOrderComplete(currentState, intent);
      case OrderState.CHECKING_STATUS:
        return this.handleCheckingStatus(currentState, intent);
      default:
        return this.handleIdle(currentState, intent);
    }
  }

  // ─── State Handlers ─────────────────────────────────────────

  private handleIdle(state: ConversationStateData, intent: ParsedIntent): TransitionResult {
    switch (intent.type) {
      case 'greeting':
      case 'want_to_order': {
        // WhatsApp names with ~ or special chars are display names, not real names
        const hasRealName = state.customerName && !state.customerName.includes('~') && state.customerName.length > 2;
        return {
          newState: OrderState.TAKING_ORDER,
          actions: [],
          llmContext: hasRealName
            ? `Saluda a ${state.customerName} de ${this.businessName}. Pregunta qué se le antoja. Catálogo:\n${this.formatCatalog()}\nSé breve.`
            : `Saluda al cliente de ${this.businessName}. Pregúntale su nombre y qué se le antoja. Catálogo:\n${this.formatCatalog()}\nSé breve.`,
        };
      }

      case 'add_items':
        // Customer jumped straight to ordering
        const validated = this.validateItems(intent.items ?? []);
        if (validated.valid.length > 0) {
          return {
            newState: OrderState.CONFIRMING_ORDER,
            actions: [],
            llmContext: `El cliente quiere:\n${this.formatOrderSummary(validated.valid)}\nTotal: $${this.calculateTotal(validated.valid)}\n${validated.invalid.length > 0 ? `NOTA: "${validated.invalid.join(', ')}" no están en el catálogo, infórmale.` : ''}\nPregunta si el pedido está correcto.`,
          };
        }
        return {
          newState: OrderState.TAKING_ORDER,
          actions: [],
          llmContext: `El cliente pidió "${intent.text}" pero esos productos NO están en el catálogo. Informa que no los tenemos y muestra lo que sí hay:\n${this.formatCatalog()}`,
        };

      case 'check_status':
        return {
          newState: OrderState.CHECKING_STATUS,
          actions: [{ tool: 'get_order_status', args: { orderNumber: intent.orderNumber ?? state.orderNumber } }],
          llmContext: 'Informa al cliente el estado de su pedido basándote en el resultado de la herramienta.',
        };

      case 'check_menu':
        return {
          newState: OrderState.TAKING_ORDER,
          actions: [{ tool: 'send_media_to_customer', args: { mediaType: 'menu' } }],
          llmContext: `Envía el menú al cliente y pregunta qué se le antoja. Catálogo:\n${this.formatCatalog()}`,
        };

      case 'repeat_order':
        return {
          newState: OrderState.CONFIRMING_ORDER,
          actions: [{ tool: 'repeat_last_order', args: { confirmFirst: true } }],
          llmContext: 'Muestra al cliente su último pedido y pregunta si lo repite igual.',
        };

      case 'complaint':
        return {
          newState: OrderState.IDLE,
          actions: [{ tool: 'escalate_complaint', args: { reason: intent.text, priority: 'medium' } }],
          llmContext: 'El cliente tiene una queja. Sé empático, discúlpate y confirma que ya se escaló al equipo.',
        };

      case 'cancel':
        if (state.orderId) {
          return {
            newState: OrderState.IDLE,
            actions: [{ tool: 'cancel_order', args: { orderId: state.orderId, reason: intent.text } }],
            llmContext: 'El cliente quiere cancelar. Confirma que se canceló el pedido.',
          };
        }
        return {
          newState: OrderState.IDLE,
          actions: [],
          llmContext: 'El cliente quiere cancelar pero no hay pedido activo. Pregunta en qué puedes ayudar.',
        };

      default: {
        // Check if asking for promos
        const promoWords = ['promo', 'oferta', 'descuento', 'combo', 'especial', 'promoción', 'promocion'];
        if (promoWords.some(k => intent.text.toLowerCase().includes(k))) {
          return {
            newState: OrderState.TAKING_ORDER,
            actions: [{ tool: 'send_media_to_customer', args: { mediaType: 'promo' } }],
            llmContext: 'Envía las promociones al cliente y pregunta si le interesa alguna.',
          };
        }
        return {
          newState: OrderState.IDLE,
          actions: [],
          llmContext: `El cliente dijo: "${intent.text}". Responde de forma útil. Si quiere pedir, muestra el catálogo:\n${this.formatCatalog()}`,
        };
      }
    }
  }

  private handleTakingOrder(state: ConversationStateData, intent: ParsedIntent): TransitionResult {
    switch (intent.type) {
      case 'add_items':
        const validated = this.validateItems(intent.items ?? []);
        const allItems = [...(state.items ?? []), ...validated.valid];
        if (allItems.length > 0) {
          return {
            newState: OrderState.CONFIRMING_ORDER,
            actions: [],
            llmContext: `El cliente quiere:\n${this.formatOrderSummary(allItems)}\nTotal: $${this.calculateTotal(allItems)}\n${validated.invalid.length > 0 ? `"${validated.invalid.join(', ')}" no están disponibles.` : ''}\nPregunta: "¿Todo correcto?"`,
          };
        }
        return {
          newState: OrderState.TAKING_ORDER,
          actions: [],
          llmContext: `"${intent.text}" no está en nuestro catálogo. Lo que tenemos:\n${this.formatCatalog()}\n¿Qué te pongo?`,
        };

      case 'check_menu':
        return {
          newState: OrderState.TAKING_ORDER,
          actions: [{ tool: 'send_media_to_customer', args: { mediaType: 'menu' } }],
          llmContext: `Envía el menú. Catálogo:\n${this.formatCatalog()}`,
        };

      case 'cancel':
        return {
          newState: OrderState.IDLE,
          actions: [],
          llmContext: 'El cliente canceló. Despídete amablemente.',
        };

      default:
        return {
          newState: OrderState.TAKING_ORDER,
          actions: [],
          llmContext: `El cliente dijo: "${intent.text}". Puede que esté pidiendo algo. Si reconoces productos, confírmalos. Si no, pregunta qué desea del catálogo:\n${this.formatCatalog()}`,
        };
    }
  }

  private handleConfirming(state: ConversationStateData, intent: ParsedIntent): TransitionResult {
    switch (intent.type) {
      case 'confirm_yes':
        return {
          newState: OrderState.ASKING_DELIVERY,
          actions: [{ tool: 'create_order', args: { items: state.items ?? intent.items ?? [] } }],
          llmContext: `Pedido creado. Pregunta: "¿Pasas a recoger o te lo enviamos a domicilio? El envío tiene un costo de $${this.deliveryCost}."`,
        };

      case 'confirm_no':
      case 'modify_order':
        return {
          newState: OrderState.TAKING_ORDER,
          actions: [],
          llmContext: 'El cliente quiere cambiar su pedido. Pregunta qué quiere modificar.',
        };

      case 'add_items':
        // Adding more items
        const validated = this.validateItems(intent.items ?? []);
        const allItems = [...(state.items ?? []), ...validated.valid];
        return {
          newState: OrderState.CONFIRMING_ORDER,
          actions: [],
          llmContext: `Pedido actualizado:\n${this.formatOrderSummary(allItems)}\nTotal: $${this.calculateTotal(allItems)}\n¿Todo correcto?`,
        };

      default:
        return {
          newState: OrderState.CONFIRMING_ORDER,
          actions: [],
          llmContext: `No entendí si confirmas el pedido. El pedido actual es:\n${this.formatOrderSummary(state.items ?? [])}\nTotal: $${this.calculateTotal(state.items ?? [])}\n¿Está correcto? (sí/no)`,
        };
    }
  }

  private handleAskingDelivery(state: ConversationStateData, intent: ParsedIntent): TransitionResult {
    switch (intent.type) {
      case 'want_delivery':
        return {
          newState: OrderState.SETTING_ADDRESS,
          actions: [],
          llmContext: `El cliente quiere envío a domicilio (costo: $${this.deliveryCost}). Pide: dirección completa (calle, colonia, referencias) y que envíe su ubicación por WhatsApp 📍.`,
        };

      case 'want_pickup':
        return {
          newState: OrderState.ASKING_PAYMENT,
          actions: [],
          llmContext: 'El cliente recoge en local. Pregunta forma de pago: "¿Pagas por transferencia o en efectivo?"',
        };

      default:
        return {
          newState: OrderState.ASKING_DELIVERY,
          actions: [],
          llmContext: `No entendí. Pregunta claramente: "¿Pasas a recoger o te lo enviamos a domicilio? ($${this.deliveryCost} de envío)"`,
        };
    }
  }

  private handleSettingAddress(state: ConversationStateData, intent: ParsedIntent): TransitionResult {
    switch (intent.type) {
      case 'give_address':
      case 'give_location':
        const addressArgs: any = { orderId: state.orderId };
        if (intent.address) {
          addressArgs.street = intent.address.street;
          addressArgs.colony = intent.address.colony;
          addressArgs.city = intent.address.city;
          addressArgs.reference = intent.address.reference;
        }
        if (intent.location) {
          addressArgs.lat = intent.location.lat;
          addressArgs.lng = intent.location.lng;
        }
        return {
          newState: OrderState.ASKING_PAYMENT,
          actions: [{ tool: 'set_delivery_address', args: addressArgs }],
          llmContext: `Dirección guardada. Informa el total con envío y pregunta forma de pago: "¿Pagas por transferencia o efectivo al repartidor?"`,
        };

      default:
        return {
          newState: OrderState.SETTING_ADDRESS,
          actions: [],
          llmContext: 'Necesito la dirección. Pide: calle, colonia, referencias. También que mande su ubicación 📍.',
        };
    }
  }

  private handleAskingPayment(state: ConversationStateData, intent: ParsedIntent): TransitionResult {
    switch (intent.type) {
      case 'want_cod':
        return {
          newState: OrderState.ORDER_COMPLETE,
          actions: [{ tool: 'set_payment_method', args: { orderId: state.orderId, method: 'cod' } }],
          llmContext: `Pago contra entrega confirmado. Mensaje final: "¡Tu pedido fue enviado a cocina! Te avisamos cuando esté listo. Pagas $${state.total ?? '?'} al repartidor. 🙌"`,
        };

      case 'want_transfer':
        return {
          newState: OrderState.PROCESSING_PAYMENT,
          actions: [{ tool: 'request_payment', args: { orderId: state.orderId } }],
          llmContext: 'Solicita el pago por transferencia. Da los datos bancarios si los tienes y pide que envíe el comprobante.',
        };

      default:
        return {
          newState: OrderState.ASKING_PAYMENT,
          actions: [],
          llmContext: 'No entendí la forma de pago. Pregunta: "¿Pagas por transferencia bancaria o efectivo contra entrega?"',
        };
    }
  }

  private handleProcessingPayment(state: ConversationStateData, intent: ParsedIntent): TransitionResult {
    if (intent.type === 'payment_proof') {
      return {
        newState: OrderState.ORDER_COMPLETE,
        actions: [],
        llmContext: 'El cliente envió comprobante de pago. Confirma: "Recibimos tu comprobante, lo estamos verificando. Tu pedido fue enviado a cocina. 🙌"',
      };
    }
    return {
      newState: OrderState.PROCESSING_PAYMENT,
      actions: [],
      llmContext: 'Estamos esperando el comprobante de pago. Recuérdale que envíe foto de la transferencia.',
    };
  }

  private handleOrderComplete(state: ConversationStateData, intent: ParsedIntent): TransitionResult {
    // After order is complete, any new message starts fresh or checks status
    if (intent.type === 'check_status') {
      return {
        newState: OrderState.CHECKING_STATUS,
        actions: [{ tool: 'get_order_status', args: { orderNumber: state.orderNumber } }],
        llmContext: 'Informa el estado del pedido.',
      };
    }
    if (intent.type === 'want_to_order' || intent.type === 'add_items') {
      return this.handleIdle({ ...state, state: OrderState.IDLE, items: undefined, orderId: undefined }, intent);
    }
    return {
      newState: OrderState.ORDER_COMPLETE,
      actions: [],
      llmContext: `El pedido ${state.orderNumber ?? ''} ya fue enviado a cocina. Si pregunta estado, usa get_order_status. Si quiere algo más, tómalo como nuevo pedido.`,
    };
  }

  private handleCheckingStatus(state: ConversationStateData, intent: ParsedIntent): TransitionResult {
    // After checking, go back to idle or take new order
    if (intent.type === 'want_to_order' || intent.type === 'add_items') {
      return this.handleIdle({ ...state, state: OrderState.IDLE }, intent);
    }
    return {
      newState: OrderState.IDLE,
      actions: [],
      llmContext: `Responde a: "${intent.text}". Si quiere pedir, muestra catálogo.`,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private validateItems(items: Array<{ productName: string; quantity: number; notes?: string }>): {
    valid: Array<{ productName: string; quantity: number; notes?: string; price: number }>;
    invalid: string[];
  } {
    const valid: Array<{ productName: string; quantity: number; notes?: string; price: number }> = [];
    const invalid: string[] = [];

    for (const item of items) {
      const match = this.catalog.find(p =>
        p.name.toLowerCase().includes(item.productName.toLowerCase()) ||
        item.productName.toLowerCase().includes(p.name.toLowerCase())
      );
      if (match) {
        valid.push({ ...item, productName: match.name, price: match.price });
      } else {
        invalid.push(item.productName);
      }
    }
    return { valid, invalid };
  }

  private calculateTotal(items: Array<{ productName: string; quantity: number; price?: number }>): number {
    return items.reduce((sum, item) => {
      const price = item.price ?? this.catalog.find(p => p.name === item.productName)?.price ?? 0;
      return sum + (price * item.quantity);
    }, 0);
  }

  private formatCatalog(): string {
    return this.catalog.map(p => `- ${p.name}: $${p.price}`).join('\n');
  }

  private formatOrderSummary(items: Array<{ productName: string; quantity: number; notes?: string; price?: number }>): string {
    return items.map(i => {
      const price = i.price ?? this.catalog.find(p => p.name === i.productName)?.price ?? 0;
      return `- ${i.quantity}x ${i.productName} ($${price * i.quantity})${i.notes ? ` [${i.notes}]` : ''}`;
    }).join('\n');
  }
}
