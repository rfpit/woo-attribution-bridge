/**
 * eBay Fulfillment API Connector
 *
 * Integrates with eBay for:
 * - Orders and fulfillment
 * - Fees and payouts
 * - Promoted Listings spend
 */

import {
  MarketplaceConnector,
  MarketplaceOrder,
  MarketplaceAdSpend,
  ConnectorConfig,
} from "./types";

// eBay API endpoints by environment
const EBAY_ENDPOINTS = {
  production: {
    auth: "https://api.ebay.com/identity/v1/oauth2/token",
    api: "https://api.ebay.com",
    authPage: "https://auth.ebay.com/oauth2/authorize",
  },
  sandbox: {
    auth: "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
    api: "https://api.sandbox.ebay.com",
    authPage: "https://auth.sandbox.ebay.com/oauth2/authorize",
  },
};

// eBay marketplace IDs
const EBAY_MARKETPLACE_IDS: Record<string, string> = {
  US: "EBAY_US",
  UK: "EBAY_GB",
  DE: "EBAY_DE",
  FR: "EBAY_FR",
  IT: "EBAY_IT",
  ES: "EBAY_ES",
  AU: "EBAY_AU",
  CA: "EBAY_CA",
};

export interface EbayConfig extends ConnectorConfig {
  environment: "production" | "sandbox";
  marketplace: string;
  ruName: string; // eBay Redirect URL Name
}

export class EbayConnector implements MarketplaceConnector {
  platform = "ebay" as const;
  private config: EbayConfig;
  private endpoints: (typeof EBAY_ENDPOINTS)["production"];

  constructor(config: EbayConfig) {
    this.config = config;
    this.endpoints =
      config.environment === "sandbox"
        ? EBAY_ENDPOINTS.sandbox
        : EBAY_ENDPOINTS.production;
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthUrl(state: string): string {
    const scopes = [
      "https://api.ebay.com/oauth/api_scope",
      "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
      "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
      "https://api.ebay.com/oauth/api_scope/sell.finances",
      "https://api.ebay.com/oauth/api_scope/sell.marketing",
    ];

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: "code",
      redirect_uri: this.config.ruName,
      scope: scopes.join(" "),
      state,
    });

    return `${this.endpoints.authPage}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");

    const response = await fetch(this.endpoints.auth, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.config.ruName,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`eBay token exchange failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString("base64");

    const response = await fetch(this.endpoints.auth, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: "https://api.ebay.com/oauth/api_scope",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`eBay token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Fetch orders from eBay Fulfillment API
   */
  async getOrders(params: {
    accessToken: string;
    startDate: Date;
    endDate: Date;
    nextToken?: string;
  }): Promise<{ orders: MarketplaceOrder[]; nextToken?: string }> {
    const marketplaceId =
      EBAY_MARKETPLACE_IDS[this.config.marketplace] || EBAY_MARKETPLACE_IDS.US;

    const queryParams = new URLSearchParams({
      filter: `creationdate:[${params.startDate.toISOString()}..${params.endDate.toISOString()}]`,
      limit: "100",
    });

    if (params.nextToken) {
      queryParams.set("offset", params.nextToken);
    }

    const response = await fetch(
      `${this.endpoints.api}/sell/fulfillment/v1/order?${queryParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
          "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`eBay orders fetch failed: ${error}`);
    }

    const data = await response.json();
    const orders = (data.orders || []).map((order: any) =>
      this.transformOrder(order),
    );

    // Calculate next offset
    const offset = parseInt(params.nextToken || "0", 10);
    const total = data.total || 0;
    const nextOffset = offset + orders.length;

    return {
      orders,
      nextToken: nextOffset < total ? nextOffset.toString() : undefined,
    };
  }

  /**
   * Transform eBay order to common format
   */
  private transformOrder(order: any): MarketplaceOrder {
    const lineItems = (order.lineItems || []).map((item: any) => ({
      id: item.lineItemId,
      sku: item.sku,
      title: item.title,
      quantity: item.quantity || 1,
      price: parseFloat(item.lineItemCost?.value || "0"),
      fees: this.calculateItemFees(item),
    }));

    const pricingSummary = order.pricingSummary || {};
    const totalFees = this.calculateOrderFees(order);

    return {
      id: order.orderId,
      externalId: order.orderId,
      orderNumber: order.orderId,
      platform: "ebay",
      status: this.mapOrderStatus(order.orderFulfillmentStatus),
      total: parseFloat(pricingSummary.total?.value || "0"),
      subtotal: parseFloat(pricingSummary.priceSubtotal?.value || "0"),
      tax: parseFloat(pricingSummary.tax?.value || "0"),
      shipping: parseFloat(pricingSummary.deliveryCost?.value || "0"),
      fees: totalFees,
      currency: pricingSummary.total?.currency || "USD",
      customerEmail: order.buyer?.email,
      customerName: order.buyer?.username,
      items: lineItems,
      createdAt: new Date(order.creationDate),
      updatedAt: new Date(order.lastModifiedDate || order.creationDate),
    };
  }

  /**
   * Calculate fees for a line item
   */
  private calculateItemFees(item: any): number {
    let fees = 0;

    // eBay final value fee is typically in deliveryCost or separate
    if (item.deliveryCost?.value) {
      // Estimate ~12.9% final value fee
      fees = parseFloat(item.lineItemCost?.value || "0") * 0.129;
    }

    return fees;
  }

  /**
   * Calculate total order fees
   */
  private calculateOrderFees(order: any): number {
    // Get fees from finances API if available
    // For now, estimate based on final value fee percentage
    const subtotal = parseFloat(
      order.pricingSummary?.priceSubtotal?.value || "0",
    );
    const finalValueFeeRate = 0.129; // 12.9% average

    return subtotal * finalValueFeeRate;
  }

  /**
   * Map eBay order status to common status
   */
  private mapOrderStatus(status: string): string {
    const statusMap: Record<string, string> = {
      NOT_STARTED: "pending",
      IN_PROGRESS: "processing",
      FULFILLED: "shipped",
      CANCELLED: "cancelled",
    };
    return statusMap[status] || "unknown";
  }

  /**
   * Fetch Promoted Listings spend
   */
  async getAdSpend(params: {
    accessToken: string;
    startDate: Date;
    endDate: Date;
  }): Promise<MarketplaceAdSpend[]> {
    const marketplaceId =
      EBAY_MARKETPLACE_IDS[this.config.marketplace] || EBAY_MARKETPLACE_IDS.US;

    // Get promoted listing campaigns
    const campaignsResponse = await fetch(
      `${this.endpoints.api}/sell/marketing/v1/ad_campaign`,
      {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
          "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
        },
      },
    );

    if (!campaignsResponse.ok) {
      console.error("eBay Promoted Listings fetch failed");
      return [];
    }

    const campaignsData = await campaignsResponse.json();
    const campaigns = campaignsData.campaigns || [];

    const adSpend: MarketplaceAdSpend[] = [];

    for (const campaign of campaigns) {
      // Get campaign performance report
      const reportResponse = await fetch(
        `${this.endpoints.api}/sell/marketing/v1/ad_report?campaign_ids=${campaign.campaignId}&date_range=${params.startDate.toISOString().split("T")[0]}..${params.endDate.toISOString().split("T")[0]}`,
        {
          headers: {
            Authorization: `Bearer ${params.accessToken}`,
            "Content-Type": "application/json",
            "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
          },
        },
      );

      if (!reportResponse.ok) continue;

      const reportData = await reportResponse.json();
      const metrics = reportData.campaignReports?.[0] || {};

      adSpend.push({
        platform: "ebay",
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        spend: parseFloat(metrics.adSpend?.value || "0"),
        impressions: metrics.impressions || 0,
        clicks: metrics.clicks || 0,
        sales: parseFloat(metrics.totalSales?.value || "0"),
        roas:
          metrics.adSpend?.value > 0
            ? metrics.totalSales?.value / metrics.adSpend?.value
            : 0,
        currency: metrics.adSpend?.currency || "USD",
        date: params.startDate,
      });
    }

    return adSpend;
  }

  /**
   * Get seller account information
   */
  async getSellerInfo(
    accessToken: string,
  ): Promise<{ sellerId: string; sellerName: string; marketplaces: string[] }> {
    // Get user information from account API
    const response = await fetch(
      `${this.endpoints.api}/commerce/identity/v1/user/`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get eBay seller info: ${error}`);
    }

    const data = await response.json();

    return {
      sellerId: data.userId || data.username,
      sellerName: data.username || "eBay Seller",
      marketplaces: [this.config.marketplace],
    };
  }
}

/**
 * Create eBay connector with environment config
 */
export function createEbayConnector(marketplace: string = "US"): EbayConnector {
  return new EbayConnector({
    clientId: process.env.EBAY_CLIENT_ID || "",
    clientSecret: process.env.EBAY_CLIENT_SECRET || "",
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/marketplaces/ebay/callback`,
    ruName: process.env.EBAY_RU_NAME || "",
    environment:
      process.env.NODE_ENV === "production" ? "production" : "sandbox",
    marketplace,
  });
}
