import { ChannelType } from './tenant.types';

export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'location' | 'interactive';
export type MessageDirection = 'inbound' | 'outbound';

/**
 * Mensaje normalizado — independiente del canal de origen.
 * Todos los adaptadores (WhatsApp, Messenger, Instagram) producen este formato.
 */
export interface IncomingMessage {
  channelType: ChannelType;
  senderId: string; // ID del usuario en el canal (wa_id, psid, etc.)
  senderName?: string;
  messageId: string; // ID único del mensaje en el canal
  type: MessageType;
  text?: string;
  mediaUrl?: string;
  mediaType?: string; // mime type si aplica
  timestamp: Date;
  raw: unknown; // payload original del canal
}

export interface OutgoingMessage {
  recipientId: string;
  type: 'text' | 'image' | 'buttons' | 'list';
  text?: string;
  imageUrl?: string;
  caption?: string;
  buttons?: MessageButton[];
  listItems?: ListItem[];
}

export interface MessageButton {
  id: string;
  label: string;
}

export interface ListItem {
  id: string;
  title: string;
  description?: string;
}
