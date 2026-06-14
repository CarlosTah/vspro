import { IsString, IsOptional, IsObject, IsEnum, IsUUID } from 'class-validator';

// ─── Profile JSONB Structure ────────────────────────────────────

export interface CustomerProfile {
  preferences?: Record<string, any>;
  sizes?: Record<string, string>;
  addresses?: Array<{
    label: string;
    street: string;
    city: string;
    zip?: string;
  }>;
  purchase_history_summary?: {
    total_orders: number;
    favorite_products: string[];
    average_order_value: number;
    last_order_date: string;
  };
  important_dates?: Record<string, string>;
  custom_facts?: Record<string, any>;
}

export const VALID_PROFILE_KEYS: (keyof CustomerProfile)[] = [
  'preferences',
  'sizes',
  'addresses',
  'purchase_history_summary',
  'important_dates',
  'custom_facts',
];

// ─── Episode Categories ─────────────────────────────────────────

export type EpisodeCategory =
  | 'conversation_summary'
  | 'preference_detected'
  | 'complaint'
  | 'product_interest'
  | 'general_context';

export const VALID_EPISODE_CATEGORIES: EpisodeCategory[] = [
  'conversation_summary',
  'preference_detected',
  'complaint',
  'product_interest',
  'general_context',
];

// ─── Result Types ───────────────────────────────────────────────

export interface EpisodeResult {
  id: string;
  content: string;
  category: string;
  similarity?: number;
  createdAt: Date;
}

export interface MigrationResult {
  totalMigrated: number;
  skipped: number;
  perCustomer: Record<string, number>;
}

// ─── Tool Args ──────────────────────────────────────────────────

export interface UpdateCustomerMemoryArgs {
  memory_type: 'profile' | 'episode';
  category: string;
  content?: string;
  data?: Record<string, any>;
}

// ─── DTOs for REST API ──────────────────────────────────────────

export class UpdateProfileDto {
  @IsString()
  category!: string;

  @IsObject()
  data!: Record<string, any>;
}

// ─── Memory Response ────────────────────────────────────────────

export interface CustomerMemoryResponse {
  profile: CustomerProfile;
  episodes: EpisodeResult[];
}
