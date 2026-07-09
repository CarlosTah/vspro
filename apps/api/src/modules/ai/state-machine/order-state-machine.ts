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
        const validatedIdle = this.validateItems(intent.items ?? []);
        if (validatedIdle.valid.length > 0) {
          const total = this.calculateTotal(validatedIdle.valid);
          const summary = this.formatOrderSummary(validatedIdle.valid);
          const invalidNote = validatedIdle.invalid.length > 0
            ? `\n\n⚠️ "${validatedIdle.invalid.join(', ')}" no los tenemos disponibles.`
            : '';
          return {
            newState: OrderState.CONFIRMING_ORDER,
            actions: [],
            llmContext: '',
            skipLlm: true,
            fixedResponse: `Tu pedido:\n${summary}\n\n💰 Total: $${total}${invalidNote}\n\n¿Todo correcto? ✅`,
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
        // Check if asking for business location
        const locationWords = ['dónde', 'donde', 'ubicación', 'ubicacion', 'dirección', 'direccion', 'cómo llego', 'como llego', 'dónde están', 'donde estan'];
        if (locationWords.some(k => intent.text.toLowerCase().includes(k))) {
          return {
            newState: OrderState.IDLE,
            actions: [],
            llmContext: `El cliente pregunta dónde está el negocio. Si tienes la dirección en los datos del negocio, compártela. Si no, di que pregunten al negocio directamente. NO inventes direcciones.`,
          };
        }

        // Check if asking how long it takes
        const timeWords = ['cuánto tarda', 'cuanto tarda', 'cuánto se tarda', 'tiempo', 'cuánto demora', 'cuanto demora', 'cuándo llega', 'cuando llega'];
        if (timeWords.some(k => intent.text.toLowerCase().includes(k))) {
          return {
            newState: state.state === OrderState.IDLE ? OrderState.IDLE : state.state,
            actions: [],
            llmContext: 'El cliente pregunta cuánto tarda. Responde: "Los pedidos para recoger tardan aprox. 15-25 minutos. Para domicilio, 30-45 minutos dependiendo la zona."',
          };
        }

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
        const validatedTO = this.validateItems(intent.items ?? []);
        // ONLY use the items from this intent — do NOT accumulate from state
        // This prevents duplicates when customer refines their order (e.g., "tortas" then "4 tortas")
        if (validatedTO.valid.length > 0) {
          const total = this.calculateTotal(validatedTO.valid);
          const summary = this.formatOrderSummary(validatedTO.valid);
          const invalidNote = validatedTO.invalid.length > 0
            ? `\n\n⚠️ "${validatedTO.invalid.join(', ')}" no los tenemos.`
            : '';
          return {
            newState: OrderState.CONFIRMING_ORDER,
            actions: [],
            llmContext: '',
            skipLlm: true,
            fixedResponse: `Tu pedido:\n${summary}\n\n💰 Total: $${total}${invalidNote}\n\n¿Todo correcto? ✅`,
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
          llmContext: `El cliente dijo: "${intent.text}". No estoy seguro de qué producto quiere. Pregunta brevemente: "¿Me puedes repetir qué te gustaría pedir?" NO muestres todo el catálogo.`,
        };
    }
  }

  private handleConfirming(state: ConversationStateData, intent: ParsedIntent): TransitionResult {
    switch (intent.type) {
      case 'confirm_yes': {
        // Check if the message also includes payment/delivery info (compound intent)
        const txt = intent.text.toLowerCase();
        const mentionsCod = ['efectivo', 'contra entrega', 'al repartidor', 'cash'].some(k => txt.includes(k));
        const mentionsPickup = ['paso', 'recojo', 'recoger', 'recogo', 'paso a recoger'].some(k => txt.includes(k));
        
        // Calculate total from state items
        const orderTotal = this.calculateTotal(state.items ?? intent.items ?? []);
        
        if (mentionsPickup && mentionsCod) {
          // "Sí, paso y pago en efectivo" — skip delivery and payment questions
          return {
            newState: OrderState.ORDER_COMPLETE,
            actions: [
              { tool: 'create_order', args: { items: state.items ?? intent.items ?? [] } },
              { tool: 'set_payment_method', args: { method: 'cod' } },
            ],
            llmContext: '',
            skipLlm: true,
            fixedResponse: `¡Listo! Tu pedido fue enviado a cocina. Pagas $${orderTotal} en efectivo al recoger. Te avisamos cuando esté listo. 🙌`,
          };
        }
        if (mentionsPickup) {
          return {
            newState: OrderState.ASKING_PAYMENT,
            actions: [{ tool: 'create_order', args: { items: state.items ?? intent.items ?? [] } }],
            llmContext: '',
            skipLlm: true,
            fixedResponse: `¡Pedido creado! Total: $${orderTotal}. ¿Pagas por transferencia o en efectivo? 💳💵`,
          };
        }
        if (mentionsCod) {
          return {
            newState: OrderState.ASKING_DELIVERY,
            actions: [{ tool: 'create_order', args: { items: state.items ?? intent.items ?? [] } }],
            llmContext: '',
            skipLlm: true,
            fixedResponse: `¡Pedido creado! Total: $${orderTotal}. Se anotó efectivo. ¿Pasas a recoger o te lo enviamos a domicilio? El envío cuesta $${this.deliveryCost}. 🛵`,
          };
        }

        return {
          newState: OrderState.ASKING_DELIVERY,
          actions: [{ tool: 'create_order', args: { items: state.items ?? intent.items ?? [] } }],
          llmContext: '',
          skipLlm: true,
          fixedResponse: `¡Pedido creado! Total: $${orderTotal}. ¿Pasas a recoger o te lo enviamos a domicilio? El envío tiene un costo de $${this.deliveryCost}. 😊`,
        };
      }

      case 'confirm_no':
      case 'modify_order':
        return {
          newState: OrderState.TAKING_ORDER,
          actions: [],
          llmContext: 'El cliente quiere cambiar su pedido. Pregunta qué quiere modificar.',
        };

      case 'add_items':
        // Adding more items
        const validatedConf = this.validateItems(intent.items ?? []);
        const allItemsConf = [...(state.items ?? []), ...validatedConf.valid];
        const totalConf = this.calculateTotal(allItemsConf);
        const summaryConf = this.formatOrderSummary(allItemsConf);
        return {
          newState: OrderState.CONFIRMING_ORDER,
          actions: [],
          llmContext: '',
          skipLlm: true,
          fixedResponse: `Pedido actualizado:\n${summaryConf}\n\n💰 Total: $${totalConf}\n\n¿Todo correcto? ✅`,
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
          llmContext: `El cliente quiere envío a domicilio. Costo envío: $${this.deliveryCost}. Total con envío: $${(state.total ?? 0) + this.deliveryCost}. SI tienes su dirección anterior en los "Datos del cliente en memoria", pregunta: "¿Te lo enviamos a [dirección anterior] o a otra dirección?" Si NO hay dirección en memoria, pide: calle, colonia, referencias y ubicación 📍. NO inventes datos, NO incluyas nombres de productos ni listas.`,
        };

      case 'want_pickup':
        return {
          newState: OrderState.ASKING_PAYMENT,
          actions: [],
          llmContext: 'El cliente recoge en local. Pregunta forma de pago: "¿Pagas por transferencia o en efectivo?"',
        };

      case 'add_items':
        // Customer wants to add more items after confirming — go back to taking order
        return {
          newState: OrderState.TAKING_ORDER,
          actions: [],
          llmContext: 'El cliente quiere agregar algo más a su pedido. Pregunta qué más quiere.',
        };

      default: {
        // Check if text contains pickup keywords not caught by classifier
        const pickupWords = ['paso', 'recojo', 'recoger', 'recogo', 'voy', 'paso por'];
        if (pickupWords.some(k => intent.text.toLowerCase().includes(k))) {
          return {
            newState: OrderState.ASKING_PAYMENT,
            actions: [],
            llmContext: 'El cliente recoge en local. Pregunta forma de pago: "¿Pagas por transferencia o en efectivo?"',
          };
        }
        return {
          newState: OrderState.ASKING_DELIVERY,
          actions: [],
          llmContext: `No entendí. Pregunta claramente: "¿Pasas a recoger o te lo enviamos a domicilio? ($${this.deliveryCost} de envío)"`,
        };
      }
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
        const totalWithShip = (state.total ?? 0) + this.deliveryCost;
        return {
          newState: OrderState.ASKING_PAYMENT,
          actions: [{ tool: 'set_delivery_address', args: addressArgs }],
          llmContext: '',
          skipLlm: true,
          fixedResponse: `Dirección guardada. Total con envío: $${totalWithShip}. ¿Pagas por transferencia o efectivo al repartidor? 💳💵`,
        };

      default: {
        // Try to detect if the text IS an address (contains numbers, street words, etc.)
        const text = intent.text.toLowerCase();
        
        // First, check if it's a question or complaint — NOT an address
        const isQuestion = text.includes('?') || text.startsWith('por q') || text.startsWith('por que') || text.startsWith('porq') ||
          ['son', 'no?', 'cuánto', 'cuanto', 'por qué', 'porque'].some(q => text.includes(q));
        
        if (!isQuestion) {
          const addressIndicators = ['calle', 'avenida', 'av.', 'av ', 'col.', 'col ', 'mz', 'manzana', 'lote', 'lt', 'num', 'número', '#', 'entre', 'esquina', 'frente'];
          // Only match numbers if the text also has address-like words, OR the text is short and has a street pattern (e.g., "Almeja 224")
          const hasAddressWord = addressIndicators.some(w => text.includes(w));
          const isShortWithNumber = text.length < 40 && /^[a-záéíóúñ\s]+\d{1,5}/i.test(text.trim());
          const looksLikeAddress = hasAddressWord || isShortWithNumber;
          
          if (looksLikeAddress) {
            const totalAddr = (state.total ?? 0) + this.deliveryCost;
            return {
              newState: OrderState.ASKING_PAYMENT,
              actions: [{ tool: 'set_delivery_address', args: { street: intent.text } }],
              llmContext: '',
              skipLlm: true,
              fixedResponse: `Dirección guardada. Total con envío: $${totalAddr}. ¿Pagas por transferencia o efectivo al repartidor? 💳💵`,
            };
          }
        }
        
        // If it's a question about price/total while in SETTING_ADDRESS, answer it
        if (isQuestion) {
          const totalWithDelivery = (state.total ?? 0) + this.deliveryCost;
          return {
            newState: OrderState.SETTING_ADDRESS,
            actions: [],
            llmContext: `El cliente pregunta sobre el total. Subtotal del pedido: $${state.total ?? 0}. Envío: $${this.deliveryCost}. Total con envío: $${totalWithDelivery}. Responde de forma clara y pide su dirección.`,
          };
        }
        
        return {
          newState: OrderState.SETTING_ADDRESS,
          actions: [],
          llmContext: 'Necesito la dirección completa. Pide: calle, número, colonia, referencias. También que mande su ubicación 📍.',
        };
      }
    }
  }

  private handleAskingPayment(state: ConversationStateData, intent: ParsedIntent): TransitionResult {
    switch (intent.type) {
      case 'want_cod':
        return {
          newState: OrderState.ORDER_COMPLETE,
          actions: [{ tool: 'set_payment_method', args: { orderId: state.orderId, method: 'cod' } }],
          llmContext: '',
          skipLlm: true,
          fixedResponse: `¡Tu pedido fue enviado a cocina! Te avisamos cuando esté listo. Pagas $${state.total ?? '?'} al repartidor. 🙌`,
        };

      case 'want_transfer':
        return {
          newState: OrderState.PROCESSING_PAYMENT,
          actions: [{ tool: 'request_payment', args: { orderId: state.orderId } }],
          llmContext: 'Solicita el pago por transferencia. Da los datos bancarios si los tienes y pide que envíe el comprobante. NO incluyas listas de productos ni inventes información.',
        };

      default: {
        // Check for COD keywords not caught by classifier
        const codWords = ['efectivo', 'en efectivo', 'al recibir', 'cuando llegue', 'al repartidor', 'contra entrega', 'cash', 'al llegar'];
        if (codWords.some(k => intent.text.toLowerCase().includes(k))) {
          return {
            newState: OrderState.ORDER_COMPLETE,
            actions: [{ tool: 'set_payment_method', args: { orderId: state.orderId, method: 'cod' } }],
            llmContext: '',
            skipLlm: true,
            fixedResponse: `¡Tu pedido fue enviado a cocina! Te avisamos cuando esté listo. Pagas $${state.total ?? '?'} en efectivo. 🙌`,
          };
        }
        // Check for transfer keywords
        const transferWords = ['transferencia', 'deposito', 'depósito', 'banco', 'transfer'];
        if (transferWords.some(k => intent.text.toLowerCase().includes(k))) {
          return {
            newState: OrderState.PROCESSING_PAYMENT,
            actions: [{ tool: 'request_payment', args: { orderId: state.orderId } }],
            llmContext: 'Solicita el pago por transferencia. Da los datos bancarios y pide comprobante.',
          };
        }
        return {
          newState: OrderState.ASKING_PAYMENT,
          actions: [],
          llmContext: '',
          skipLlm: true,
          fixedResponse: `Total: $${state.total ?? '?'}. ¿Pagas por transferencia bancaria o efectivo contra entrega? 💳💵`,
        };
      }
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
    if (intent.type === 'complaint') {
      return {
        newState: OrderState.IDLE,
        actions: [{ tool: 'escalate_complaint', args: { reason: intent.text, priority: 'medium' } }],
        llmContext: 'El cliente tiene un problema con su pedido entregado. Sé empático, discúlpate, y confirma que se escaló al equipo para resolverlo.',
      };
    }
    // Check if asking about time
    const timeQ = ['cuánto', 'cuanto', 'tarda', 'demora', 'tiempo', 'cuándo', 'cuando'];
    if (timeQ.some(k => intent.text.toLowerCase().includes(k))) {
      return {
        newState: OrderState.ORDER_COMPLETE,
        actions: [],
        llmContext: 'El cliente pregunta cuánto tarda. Responde que su pedido ya está en preparación/camino según el estado. Si es pickup: "15-25 min". Si delivery: "30-45 min aprox."',
      };
    }

    // Any other message after order complete — check if it's a complaint by keywords
    const complaintWords = ['no trae', 'falta', 'está mal', 'incorrecto', 'frío', 'frio', 'tardó', 'queja', 'molesto'];
    if (complaintWords.some(k => intent.text.toLowerCase().includes(k))) {
      return {
        newState: OrderState.IDLE,
        actions: [{ tool: 'escalate_complaint', args: { reason: intent.text, priority: 'medium' } }],
        llmContext: 'El cliente reporta un problema con su pedido. Sé empático y confirma que se escaló al equipo.',
      };
    }
    return {
      newState: OrderState.ORDER_COMPLETE,
      actions: [],
      llmContext: `El pedido ${state.orderNumber ?? ''} ya fue procesado. Si tienes algún problema con tu pedido, con gusto te ayudo. ¿Necesitas algo más?`,
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

    // Common synonyms for food businesses
    const synonyms: Record<string, string[]> = {
      'refresco': ['coca', 'coca cola', 'coca-cola', 'pepsi', 'soda', 'gaseosa'],
      'agua de horchata': ['horchata', 'agua horchata'],
      'taco al pastor': ['pastor', 'de pastor', 'al pastor', 'taco pastor'],
      'taco de bistec': ['bistec', 'de bistec', 'taco bistec', 'bistek', 'de bistek'],
      'tacos de suadero': ['suadero', 'de suadero', 'taco suadero'],
      'tacos de longaniza': ['longaniza', 'de longaniza', 'taco longaniza'],
      'quesadilla': ['quesa', 'quesadillas'],
      'torta de jamón': ['torta', 'torta jamón', 'torta de jamon'],
      'orden de guacamole': ['guacamole', 'guaca', 'orden guacamole'],
    };

    for (const item of items) {
      const inputName = item.productName.toLowerCase().trim();

      // Direct match
      let match = this.catalog.find(p =>
        p.name.toLowerCase().includes(inputName) ||
        inputName.includes(p.name.toLowerCase())
      );

      // Synonym match if no direct match
      if (!match) {
        for (const [catalogName, alts] of Object.entries(synonyms)) {
          if (alts.some(alt => inputName.includes(alt) || alt.includes(inputName))) {
            match = this.catalog.find(p => p.name.toLowerCase() === catalogName);
            break;
          }
        }
      }

      // Partial match — at least 4 chars matching
      if (!match && inputName.length >= 4) {
        match = this.catalog.find(p => {
          const catLower = p.name.toLowerCase();
          return catLower.includes(inputName.substring(0, 4)) || inputName.includes(catLower.substring(0, 4));
        });
      }

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
      const price = item.price ?? this.catalog.find(p => p.name.toLowerCase() === item.productName.toLowerCase())?.price ?? 0;
      return sum + (price * item.quantity);
    }, 0);
  }

  private formatCatalog(): string {
    return this.catalog.map(p => `- ${p.name}: $${p.price}`).join('\n');
  }

  private formatOrderSummary(items: Array<{ productName: string; quantity: number; notes?: string; price?: number }>): string {
    return items.map(i => {
      const price = i.price ?? this.catalog.find(p => p.name.toLowerCase() === i.productName.toLowerCase())?.price ?? 0;
      return `- ${i.quantity}x ${i.productName} ($${price * i.quantity})${i.notes ? ` [${i.notes}]` : ''}`;
    }).join('\n');
  }
}
