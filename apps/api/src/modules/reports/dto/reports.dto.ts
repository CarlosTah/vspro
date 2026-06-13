import { IsOptional, IsString, IsDateString } from 'class-validator';

// ─── Query Parameters ───────────────────────────────────────────

export class ReportPeriodDto {
  @IsOptional()
  @IsDateString()
  from?: string; // YYYY-MM-DD

  @IsOptional()
  @IsDateString()
  to?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  period?: 'today' | 'week' | 'month' | 'quarter' | 'year';
}

// ─── Summary Response ───────────────────────────────────────────

export interface BusinessSummary {
  period: { from: string; to: string };
  orders: {
    total: number;
    new: number;
    inProduction: number;
    shipped: number;
    delivered: number;
    cancelled: number;
  };
  revenue: {
    total: number;
    paid: number;
    pending: number;
    averageOrderValue: number;
  };
  customers: {
    total: number;
    newInPeriod: number;
    returning: number;
  };
  conversations: {
    total: number;
    active: number;
    resolved: number;
    averageResponseTime?: number;
  };
}

// ─── Financial Dashboard ────────────────────────────────────────

export interface FinancialDashboard {
  period: { from: string; to: string };
  income: {
    grossRevenue: number;
    netRevenue: number;
    taxCollected: number;
    shippingRevenue: number;
    refunds: number;
  };
  payments: {
    total: number;
    verified: number;
    pending: number;
    rejected: number;
    byMethod: Record<string, { count: number; amount: number }>;
  };
  accounting: {
    totalEntries: number;
    sales: number;
    shipping: number;
    refunds: number;
    adjustments: number;
  };
  trends: {
    dailyRevenue: Array<{ date: string; amount: number }>;
  };
}

// ─── Performance Metrics ────────────────────────────────────────

export interface PerformanceMetrics {
  period: { from: string; to: string };
  fulfillment: {
    averageTimeToShip: number; // hours from paid → shipped
    averageTimeToDeliver: number; // hours from shipped → delivered
    onTimeDeliveryRate: number; // percentage
    productionBacklog: number;
  };
  ai: {
    totalMessages: number;
    aiHandled: number;
    humanEscalated: number;
    automationRate: number; // percentage
    averageResponseTime: number; // seconds
    toolCallsExecuted: number;
    memoryUpdates: number;
  };
  products: {
    topSelling: Array<{ name: string; quantity: number; revenue: number }>;
    lowStock: Array<{ name: string; sku: string; stock: number; minimum: number }>;
    outOfStock: number;
  };
  channels: {
    byChannel: Record<string, { messages: number; orders: number; revenue: number }>;
  };
}
