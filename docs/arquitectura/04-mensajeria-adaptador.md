# Capa de Mensajería — Adaptador Unificado

## Patrón Strategy para Multi-Canal

Todos los canales exponen la misma interfaz. El sistema no sabe ni le importa si el mensaje viene de WhatsApp, Messenger o Instagram.

```typescript
// packages/messaging/src/interfaces/messaging-channel.interface.ts

export interface IMessagingChannel {
  sendText(recipientId: string, text: string): Promise<void>;
  sendImage(recipientId: string, imageUrl: string, caption?: string): Promise<void>;
  sendButtons(recipientId: string, text: string, buttons: Button[]): Promise<void>;
  sendList(recipientId: string, header: string, items: ListItem[]): Promise<void>;
  markAsRead(messageId: string): Promise<void>;
  parseIncomingMessage(payload: any): IncomingMessage;
}

// Mensaje normalizado (independiente del canal)
export interface IncomingMessage {
  channelType: 'whatsapp' | 'messenger' | 'instagram';
  senderId: string;          // ID del usuario en el canal
  senderName?: string;
  messageId: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'location';
  text?: string;
  mediaUrl?: string;
  timestamp: Date;
  raw: any;                  // payload original por si se necesita
}
```

---

## Implementación WhatsApp (Meta Cloud API)

```typescript
// packages/messaging/src/channels/whatsapp.channel.ts

@Injectable()
export class WhatsAppChannel implements IMessagingChannel {
  private readonly baseUrl = 'https://graph.facebook.com/v19.0';

  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
  ) {}

  async sendText(recipientId: string, text: string): Promise<void> {
    await axios.post(
      `${this.baseUrl}/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientId,
        type: 'text',
        text: { body: text, preview_url: false }
      },
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
  }

  async sendButtons(
    recipientId: string,
    text: string,
    buttons: Button[]
  ): Promise<void> {
    await axios.post(
      `${this.baseUrl}/${this.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: recipientId,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text },
          action: {
            buttons: buttons.map((btn, i) => ({
              type: 'reply',
              reply: { id: btn.id || `btn_${i}`, title: btn.label }
            }))
          }
        }
      },
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
  }

  parseIncomingMessage(payload: MetaWebhookPayload): IncomingMessage {
    const entry = payload.entry[0];
    const change = entry.changes[0];
    const msg = change.value.messages[0];
    const contact = change.value.contacts?.[0];

    return {
      channelType: 'whatsapp',
      senderId: msg.from,
      senderName: contact?.profile?.name,
      messageId: msg.id,
      type: msg.type as any,
      text: msg.text?.body,
      mediaUrl: msg.image?.id
        ? `${this.baseUrl}/${msg.image.id}` // se descarga aparte
        : undefined,
      timestamp: new Date(parseInt(msg.timestamp) * 1000),
      raw: payload,
    };
  }
}
```

---

## Implementación Messenger / Instagram

```typescript
// packages/messaging/src/channels/messenger.channel.ts

@Injectable()
export class MessengerChannel implements IMessagingChannel {
  private readonly baseUrl = 'https://graph.facebook.com/v19.0';

  async sendText(recipientId: string, text: string): Promise<void> {
    await axios.post(
      `${this.baseUrl}/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text },
        messaging_type: 'RESPONSE'
      },
      {
        params: { access_token: this.accessToken }
      }
    );
  }

  async sendButtons(
    recipientId: string,
    text: string,
    buttons: Button[]
  ): Promise<void> {
    await axios.post(
      `${this.baseUrl}/me/messages`,
      {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text,
              buttons: buttons.map(btn => ({
                type: 'postback',
                title: btn.label,
                payload: btn.id
              }))
            }
          }
        }
      },
      { params: { access_token: this.accessToken } }
    );
  }

  parseIncomingMessage(payload: any): IncomingMessage {
    const messaging = payload.entry[0].messaging[0];
    return {
      channelType: 'messenger',
      senderId: messaging.sender.id,
      messageId: messaging.message.mid,
      type: messaging.message.attachments ? 'image' : 'text',
      text: messaging.message.text,
      mediaUrl: messaging.message.attachments?.[0]?.payload?.url,
      timestamp: new Date(messaging.timestamp),
      raw: payload,
    };
  }
}

// Instagram DM usa la misma API de Messenger con minor diferencias
@Injectable()
export class InstagramChannel extends MessengerChannel {
  parseIncomingMessage(payload: any): IncomingMessage {
    const msg = super.parseIncomingMessage(payload);
    return { ...msg, channelType: 'instagram' };
  }
}
```

---

## Factory de Canales

```typescript
// packages/messaging/src/messaging.factory.ts

@Injectable()
export class MessagingFactory {

  createChannel(
    type: 'whatsapp' | 'messenger' | 'instagram',
    config: ChannelConfig
  ): IMessagingChannel {
    switch (type) {
      case 'whatsapp':
        return new WhatsAppChannel(
          config.phoneNumberId,
          config.accessToken
        );
      case 'messenger':
        return new MessengerChannel(config.accessToken);
      case 'instagram':
        return new InstagramChannel(config.accessToken);
      default:
        throw new Error(`Canal no soportado: ${type}`);
    }
  }
}
```

---

## Flujo Completo de un Mensaje Entrante

```
1. Meta envía POST a /webhooks/meta/{tenantSlug}
        ↓
2. WebhooksController verifica firma HMAC
        ↓
3. Encola en BullMQ: queue "messages", job "process-message"
        ↓ (asíncrono, responde 200 a Meta inmediatamente)
4. MessageWorker procesa el job:
   a. Identifica tenant por slug
   b. Cambia search_path al schema del tenant
   c. Parsea mensaje con el adaptador del canal correspondiente
   d. Busca o crea Customer en BD
   e. Busca o crea Conversation activa
   f. Guarda Message en BD
   g. Llama a AiEngineService.processMessage()
        ↓
5. AiEngineService:
   a. Carga historial de conversación
   b. Carga config de IA del tenant
   c. Busca productos relevantes (pgvector)
   d. Llama a GPT-4o con function calling
   e. Si GPT llama a una tool → ejecuta la acción (crear pedido, verificar pago, etc.)
   f. Obtiene respuesta final en texto
        ↓
6. MessagingService.sendToCustomer():
   a. Obtiene canal activo del tenant
   b. Usa el adaptador correcto
   c. Envía respuesta al cliente
        ↓
7. Guarda mensaje de respuesta en BD
8. Actualiza last_message_at en Conversation
9. Emite evento WebSocket al panel admin (conversación actualizada en tiempo real)
```
