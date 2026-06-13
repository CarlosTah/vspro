export type AiTone = 'formal' | 'casual' | 'friendly';

export interface AiConfig {
  assistantName: string;
  tone: AiTone;
  welcomeMessage: string;
  awayMessage: string;
  language: string;
  businessHours: BusinessHours;
  customInstructions?: string;
}

export interface BusinessHours {
  mon?: DayHours;
  tue?: DayHours;
  wed?: DayHours;
  thu?: DayHours;
  fri?: DayHours;
  sat?: DayHours;
  sun?: DayHours;
}

export interface DayHours {
  open: string; // "09:00"
  close: string; // "18:00"
}

export interface AiResponse {
  text: string;
  actions: AiAction[];
  shouldEscalate: boolean; // true si la IA no pudo resolver y debe pasar a humano
}

export type AiActionType =
  | 'create_order'
  | 'check_availability'
  | 'get_order_status'
  | 'verify_payment'
  | 'request_address'
  | 'escalate_to_human';

export interface AiAction {
  type: AiActionType;
  payload: Record<string, unknown>;
}
