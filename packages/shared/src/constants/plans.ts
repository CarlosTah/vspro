import { PlanFeatures } from '../types/tenant.types';

export const PLAN_SLUGS = {
  BASIC: 'basic',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
} as const;

export const PLAN_FEATURES: Record<string, PlanFeatures> = {
  [PLAN_SLUGS.BASIC]: {
    maxOrdersPerMonth: 20,
    maxProducts: 10,
    maxUsers: 2,
    channels: ['whatsapp'],
    aiEnabled: true,
    ocrEnabled: true,
    advancedReports: false,
    whiteLabel: false,
    integrations: [],
  },
  [PLAN_SLUGS.PRO]: {
    maxOrdersPerMonth: 70,
    maxProducts: 50,
    maxUsers: 5,
    channels: ['whatsapp', 'messenger', 'instagram'],
    aiEnabled: true,
    ocrEnabled: true,
    advancedReports: true,
    whiteLabel: false,
    integrations: ['accounting'],
  },
  [PLAN_SLUGS.ENTERPRISE]: {
    maxOrdersPerMonth: null, // ilimitado
    maxProducts: null, // ilimitado
    maxUsers: 20,
    channels: ['whatsapp', 'messenger', 'instagram'],
    aiEnabled: true,
    ocrEnabled: true,
    advancedReports: true,
    whiteLabel: true,
    integrations: ['accounting', 'erp', 'ecommerce'],
  },
};

/** Días de prueba gratis */
export const TRIAL_DAYS = 7;

/** Precios en MXN */
export const PLAN_PRICES = {
  [PLAN_SLUGS.BASIC]: { monthly: 990, yearly: 9900 },
  [PLAN_SLUGS.PRO]: { monthly: 1490, yearly: 14900 },
  [PLAN_SLUGS.ENTERPRISE]: { monthly: 2499, yearly: 24990 },
} as const;

/** Porcentaje de uso a partir del cual se envía alerta al tenant */
export const QUOTA_WARNING_THRESHOLD = 0.8;
