export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

export interface TenantContext {
  id: string;
  slug: string;
  schemaName: string;
  businessName: string;
  status: TenantStatus;
  planSlug: string;
  planFeatures: PlanFeatures;
}

export interface PlanFeatures {
  maxOrdersPerMonth: number | null; // null = ilimitado
  maxProducts: number | null;
  maxUsers: number;
  channels: ChannelType[];
  aiEnabled: boolean;
  ocrEnabled: boolean;
  advancedReports: boolean;
  whiteLabel: boolean;
  integrations: string[];
}

export type ChannelType = 'whatsapp' | 'messenger' | 'instagram';
