/**
 * Messaging Channel Interface — Strategy Pattern.
 * Each messaging platform (WhatsApp, Messenger, Instagram) implements this.
 */
export interface MessagingChannel {
  readonly type: ChannelType;

  /** Send a text message to a recipient */
  sendText(params: SendTextParams): Promise<SendResult>;

  /** Send a template message (for outside 24h window) */
  sendTemplate(params: SendTemplateParams): Promise<SendResult>;

  /** Send media (image, document, audio) */
  sendMedia(params: SendMediaParams): Promise<SendResult>;

  /** Mark a message as read */
  markAsRead(messageId: string, channelConfig: ChannelConfig): Promise<void>;
}

// ─── Types ──────────────────────────────────────────────────────

export type ChannelType = 'whatsapp' | 'messenger' | 'instagram';

export interface ChannelConfig {
  type: ChannelType;
  externalId: string;    // Phone Number ID (WA) / Page ID (FB)
  accessToken: string;
  webhookVerifyToken?: string;
}

export interface SendTextParams {
  recipientId: string;   // wa_id / psid / ig_id
  text: string;
  channelConfig: ChannelConfig;
}

export interface SendTemplateParams {
  recipientId: string;
  templateName: string;
  language: string;
  components?: any[];
  channelConfig: ChannelConfig;
}

export interface SendMediaParams {
  recipientId: string;
  mediaType: 'image' | 'document' | 'audio' | 'video';
  mediaUrl: string;
  caption?: string;
  channelConfig: ChannelConfig;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
