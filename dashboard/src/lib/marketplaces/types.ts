/**
 * Marketplace Connector Types
 *
 * Common interfaces for all marketplace integrations.
 */

export interface MarketplaceOrder {
  id: string;
  externalId: string;
  orderNumber: string;
  platform: "amazon" | "ebay" | "etsy";
  status: string;
  total: number;
  subtotal: number;
  tax: number;
  shipping: number;
  fees: number;
  currency: string;
  customerEmail?: string;
  customerName?: string;
  items: MarketplaceLineItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketplaceLineItem {
  id: string;
  sku?: string;
  title: string;
  quantity: number;
  price: number;
  fees?: number;
}

export interface MarketplaceMetrics {
  revenue: number;
  orders: number;
  fees: number;
  netRevenue: number;
  aov: number;
  currency: string;
  period: {
    start: Date;
    end: Date;
  };
}

export interface MarketplaceAdSpend {
  platform: "amazon" | "ebay" | "etsy";
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  sales: number;
  acos?: number; // Advertising Cost of Sale (Amazon)
  roas?: number;
  currency: string;
  date: Date;
}

export interface MarketplaceConnection {
  id: string;
  userId: string;
  platform: "amazon" | "ebay" | "etsy";
  sellerId: string;
  sellerName?: string;
  marketplace?: string; // e.g., "US", "UK", "DE"
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
  status: "active" | "expired" | "error";
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketplaceConnector {
  platform: "amazon" | "ebay" | "etsy";

  /**
   * Get OAuth authorization URL
   */
  getAuthUrl(state: string): string;

  /**
   * Exchange authorization code for tokens
   */
  exchangeCodeForTokens(
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>;

  /**
   * Refresh access token
   */
  refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresIn: number }>;

  /**
   * Fetch orders from marketplace
   */
  getOrders(params: {
    accessToken: string;
    startDate: Date;
    endDate: Date;
    nextToken?: string;
  }): Promise<{ orders: MarketplaceOrder[]; nextToken?: string }>;

  /**
   * Fetch ad spend data
   */
  getAdSpend(params: {
    accessToken: string;
    startDate: Date;
    endDate: Date;
  }): Promise<MarketplaceAdSpend[]>;

  /**
   * Get seller account info
   */
  getSellerInfo(accessToken: string): Promise<{
    sellerId: string;
    sellerName: string;
    marketplaces?: string[];
  }>;
}

export interface ConnectorConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
  marketplace?: string;
}
