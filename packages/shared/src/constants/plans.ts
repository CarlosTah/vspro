import { PlanFeatures } from '../types/tenant.types';

export const PLAN_SLUGS = {
  BASIC: 'basic',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
} as const;

export const PLAN_FEATURES: Record<string, PlanFeatures> = {
  [PLAN_SLUGS.BASIC]: {
    maxOrdersPerMonth: 200,
    maxProducts: 50,
    maxUsers: 2,
    channels: ['whatsapp'],
    aiEnabled: true,
    ocrEnabled: true,
    advancedReports: false,
    whiteLabel: false,
    integrations: [],
  },
  [PLAN_SLUGS.PRO]: {
    maxOrdersPerMonth: 1000,
    maxProducts: 500,
    maxUsers: 5,
    channels: ['whatsapp', 'messenger'],
    aiEnabled: true,
    ocrEnabled: true,
    advancedReports: true,
    whiteLabel: false,
    integrations: ['accounting'],
  },
  [PLAN_SLUGS.ENTERPRISE]: {
    maxOrdersPerMonth: null, // ilimitado
    maxProducts: null,
    maxUsers: 20,
    channels: ['whatsapp', 'messenger', 'instagram'],
    aiEnabled: true,
    ocrEnabled: true,
    advancedReports: true,
    whiteLabel: true,
    integrations: ['accounting', 'erp', 'ecommerce'],
  },
};

/** Porcentaje de uso a partir del cual se envía alerta al tenant */
export const QUOTA_WARNING_THRESHOLD = 0.8;
