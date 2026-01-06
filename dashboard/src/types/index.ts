// Store types
export interface Store {
  id: string;
  userId: string;
  name: string;
  url: string;
  platform: "woocommerce" | "shopify";
  apiKey: string;
  status: "active" | "disconnected" | "error";
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Order types
export interface Order {
  id: string;
  storeId: string;
  externalId: string;
  orderNumber: string;
  total: number;
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  currency: string;
  status: string;
  customerEmailHash: string;
  isNewCustomer: boolean;
  paymentMethod: string;
  dateCreated: Date;
  dateCompleted: Date | null;
  attribution: Attribution | null;
  surveyResponse: string | null;
  surveySource: string | null;
}

// Attribution types
export interface Attribution {
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  msclkid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
  landingPage?: string;
}

// Ad Platform types
export interface AdPlatformConnection {
  id: string;
  userId: string;
  platform: "meta" | "google" | "tiktok";
  accountId: string;
  accountName: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  status: "active" | "expired" | "error";
  createdAt: Date;
  updatedAt: Date;
}

export interface AdSpend {
  id: string;
  connectionId: string;
  campaignId: string;
  campaignName: string;
  date: Date;
  spend: number;
  impressions: number;
  clicks: number;
  currency: string;
}

// Metrics types
export interface DashboardMetrics {
  revenue: {
    total: number;
    new: number;
    returning: number;
    change: number;
  };
  orders: {
    total: number;
    new: number;
    returning: number;
    change: number;
  };
  aov: {
    overall: number;
    new: number;
    returning: number;
    change: number;
  };
  roas: {
    blended: number;
    newCustomer: number;
    returning: number;
    change: number;
  };
  mer: number;
  adSpend: {
    total: number;
    byPlatform: Record<string, number>;
  };
  attribution: AttributionBreakdown[];
  surveyResponses: SurveyBreakdown[];
}

export interface AttributionBreakdown {
  source: string;
  orders: number;
  revenue: number;
  percentage: number;
}

export interface SurveyBreakdown {
  response: string;
  count: number;
  revenue: number;
  percentage: number;
}

export interface ChannelPerformance {
  channel: string;
  spend: number;
  revenue: number;
  orders: number;
  newCustomers: number;
  roas: number;
  ncRoas: number;
  cac: number;
}

// Date range types
export type DateRange = "today" | "7d" | "30d" | "90d" | "ytd" | "custom";

export interface DateRangeValue {
  from: Date;
  to: Date;
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
