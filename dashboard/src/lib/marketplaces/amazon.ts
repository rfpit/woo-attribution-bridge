/**
 * Amazon Selling Partner API (SP-API) Connector
 *
 * Integrates with Amazon for:
 * - Orders and returns
 * - Fees calculation
 * - Advertising (Sponsored Products) spend
 */

import {
  MarketplaceConnector,
  MarketplaceOrder,
  MarketplaceAdSpend,
  ConnectorConfig,
} from "./types";

// Amazon SP-API endpoints by region
const AMAZON_REGIONS: Record<
  string,
  { auth: string; api: string; advertising: string }
> = {
  NA: {
    auth: "https://api.amazon.com/auth/o2/token",
    api: "https://sellingpartnerapi-na.amazon.com",
    advertising: "https://advertising-api.amazon.com",
  },
  EU: {
    auth: "https://api.amazon.co.uk/auth/o2/token",
    api: "https://sellingpartnerapi-eu.amazon.com",
    advertising: "https://advertising-api-eu.amazon.com",
  },
  FE: {
    auth: "https://api.amazon.co.jp/auth/o2/token",
    api: "https://sellingpartnerapi-fe.amazon.com",
    advertising: "https://advertising-api-fe.amazon.com",
  },
};

// Marketplace IDs
const MARKETPLACE_IDS: Record<string, string> = {
  US: "ATVPDKIKX0DER",
  CA: "A2EUQ1WTGCTBG2",
  MX: "A1AM78C64UM0Y8",
  UK: "A1F83G8C2ARO7P",
  DE: "A1PA6795UKMFR9",
  FR: "A13V1IB3VIYBER",
  IT: "APJ6JRA9NG5V4",
  ES: "A1RKKUPIHCS9HS",
  NL: "A1805IZSGTT6HS",
  JP: "A1VC38T7YXB528",
  AU: "A39IBJ37TRP1C6",
};

export interface AmazonConfig extends ConnectorConfig {
  region: "NA" | "EU" | "FE";
  marketplace: string;
  lwaClientId: string;
  lwaClientSecret: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  roleArn?: string;
}

export class AmazonConnector implements MarketplaceConnector {
  platform = "amazon" as const;
  private config: AmazonConfig;
  private endpoints: (typeof AMAZON_REGIONS)["NA"];

  constructor(config: AmazonConfig) {
    this.config = config;
    this.endpoints = AMAZON_REGIONS[config.region] || AMAZON_REGIONS.NA;
  }

  /**
   * Get OAuth authorization URL for Amazon Login with Amazon (LWA)
   */
  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.lwaClientId,
      scope: "sellingpartnerapi::notifications sellingpartnerapi::orders::read",
      response_type: "code",
      redirect_uri: this.config.redirectUri,
      state,
    });

    return `https://www.amazon.com/ap/oa?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access and refresh tokens
   */
  async exchangeCodeForTokens(
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const response = await fetch(this.endpoints.auth, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.config.redirectUri,
        client_id: this.config.lwaClientId,
        client_secret: this.config.lwaClientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Amazon token exchange failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const response = await fetch(this.endpoints.auth, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.config.lwaClientId,
        client_secret: this.config.lwaClientSecret,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Amazon token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Fetch orders from Amazon SP-API
   */
  async getOrders(params: {
    accessToken: string;
    startDate: Date;
    endDate: Date;
    nextToken?: string;
  }): Promise<{ orders: MarketplaceOrder[]; nextToken?: string }> {
    const marketplaceId =
      MARKETPLACE_IDS[this.config.marketplace] || MARKETPLACE_IDS.US;

    const queryParams = new URLSearchParams({
      MarketplaceIds: marketplaceId,
      CreatedAfter: params.startDate.toISOString(),
      CreatedBefore: params.endDate.toISOString(),
      MaxResultsPerPage: "100",
    });

    if (params.nextToken) {
      queryParams.set("NextToken", params.nextToken);
    }

    const response = await fetch(
      `${this.endpoints.api}/orders/v0/orders?${queryParams.toString()}`,
      {
        headers: {
          "x-amz-access-token": params.accessToken,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Amazon orders fetch failed: ${error}`);
    }

    const data = await response.json();
    const orders = await Promise.all(
      (data.payload?.Orders || []).map(async (order: any) => {
        // Fetch order items
        const items = await this.getOrderItems(
          params.accessToken,
          order.AmazonOrderId,
        );

        return this.transformOrder(order, items);
      }),
    );

    return {
      orders,
      nextToken: data.payload?.NextToken,
    };
  }

  /**
   * Fetch order items (line items) for an order
   */
  private async getOrderItems(
    accessToken: string,
    orderId: string,
  ): Promise<any[]> {
    const response = await fetch(
      `${this.endpoints.api}/orders/v0/orders/${orderId}/orderItems`,
      {
        headers: {
          "x-amz-access-token": accessToken,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      console.error(`Failed to fetch items for order ${orderId}`);
      return [];
    }

    const data = await response.json();
    return data.payload?.OrderItems || [];
  }

  /**
   * Transform Amazon order to common format
   */
  private transformOrder(order: any, items: any[]): MarketplaceOrder {
    const lineItems = items.map((item) => ({
      id: item.OrderItemId,
      sku: item.SellerSKU,
      title: item.Title,
      quantity: parseInt(item.QuantityOrdered, 10) || 1,
      price: parseFloat(item.ItemPrice?.Amount || "0"),
      fees: this.calculateItemFees(item),
    }));

    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const totalFees = lineItems.reduce(
      (sum, item) => sum + (item.fees || 0),
      0,
    );

    return {
      id: order.AmazonOrderId,
      externalId: order.AmazonOrderId,
      orderNumber: order.AmazonOrderId,
      platform: "amazon",
      status: this.mapOrderStatus(order.OrderStatus),
      total: parseFloat(order.OrderTotal?.Amount || "0"),
      subtotal,
      tax: parseFloat(order.TaxExclusiveAmount?.Amount || "0"),
      shipping: parseFloat(order.ShippingPrice?.Amount || "0"),
      fees: totalFees,
      currency: order.OrderTotal?.CurrencyCode || "USD",
      customerEmail: order.BuyerInfo?.BuyerEmail,
      customerName: order.BuyerInfo?.BuyerName,
      items: lineItems,
      createdAt: new Date(order.PurchaseDate),
      updatedAt: new Date(order.LastUpdateDate),
    };
  }

  /**
   * Calculate Amazon fees for an item
   */
  private calculateItemFees(item: any): number {
    let fees = 0;

    // Referral fee
    if (item.ItemFeeList) {
      for (const fee of item.ItemFeeList) {
        if (fee.FeeAmount?.Amount) {
          fees += Math.abs(parseFloat(fee.FeeAmount.Amount));
        }
      }
    }

    return fees;
  }

  /**
   * Map Amazon order status to common status
   */
  private mapOrderStatus(status: string): string {
    const statusMap: Record<string, string> = {
      Pending: "pending",
      Unshipped: "processing",
      PartiallyShipped: "processing",
      Shipped: "shipped",
      Canceled: "cancelled",
      Unfulfillable: "cancelled",
    };
    return statusMap[status] || "unknown";
  }

  /**
   * Fetch advertising spend from Amazon Advertising API
   */
  async getAdSpend(params: {
    accessToken: string;
    startDate: Date;
    endDate: Date;
  }): Promise<MarketplaceAdSpend[]> {
    // Note: Amazon Advertising API requires separate OAuth flow
    // This is a simplified implementation
    const response = await fetch(
      `${this.endpoints.advertising}/v2/sp/campaigns`,
      {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Amazon-Advertising-API-ClientId": this.config.clientId,
          "Amazon-Advertising-API-Scope": await this.getProfileId(
            params.accessToken,
          ),
        },
      },
    );

    if (!response.ok) {
      console.error("Amazon Advertising API fetch failed");
      return [];
    }

    const campaigns = await response.json();

    // Fetch metrics for each campaign
    const adSpend: MarketplaceAdSpend[] = [];

    for (const campaign of campaigns) {
      const metrics = await this.getCampaignMetrics(
        params.accessToken,
        campaign.campaignId,
        params.startDate,
        params.endDate,
      );

      if (metrics) {
        adSpend.push({
          platform: "amazon",
          campaignId: campaign.campaignId,
          campaignName: campaign.name,
          spend: metrics.cost || 0,
          impressions: metrics.impressions || 0,
          clicks: metrics.clicks || 0,
          sales: metrics.attributedSales || 0,
          acos: metrics.acos,
          roas: metrics.cost > 0 ? metrics.attributedSales / metrics.cost : 0,
          currency: "USD",
          date: params.startDate,
        });
      }
    }

    return adSpend;
  }

  /**
   * Get Amazon Advertising profile ID
   */
  private async getProfileId(accessToken: string): Promise<string> {
    const response = await fetch(`${this.endpoints.advertising}/v2/profiles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Amazon-Advertising-API-ClientId": this.config.clientId,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get Amazon Advertising profile");
    }

    const profiles = await response.json();
    const profile = profiles.find(
      (p: any) =>
        p.countryCode === this.config.marketplace ||
        p.marketplace === this.config.marketplace,
    );

    return profile?.profileId || profiles[0]?.profileId;
  }

  /**
   * Get campaign metrics
   */
  private async getCampaignMetrics(
    accessToken: string,
    campaignId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    // Request a report
    const reportResponse = await fetch(
      `${this.endpoints.advertising}/v2/sp/campaigns/report`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Amazon-Advertising-API-ClientId": this.config.clientId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaignType: "sponsoredProducts",
          reportDate: startDate.toISOString().split("T")[0],
          metrics:
            "impressions,clicks,cost,attributedSales14d,attributedConversions14d",
        }),
      },
    );

    if (!reportResponse.ok) {
      return null;
    }

    const reportData = await reportResponse.json();
    return reportData;
  }

  /**
   * Get seller account information
   */
  async getSellerInfo(
    accessToken: string,
  ): Promise<{ sellerId: string; sellerName: string; marketplaces: string[] }> {
    // Get marketplace participations
    const response = await fetch(
      `${this.endpoints.api}/sellers/v1/marketplaceParticipations`,
      {
        headers: {
          "x-amz-access-token": accessToken,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get seller info: ${error}`);
    }

    const data = await response.json();
    const participations = data.payload || [];

    // Extract seller ID from first participation
    const sellerId = participations[0]?.marketplace?.sellerId || "unknown";
    const sellerName = participations[0]?.marketplace?.name || "Amazon Seller";
    const marketplaces = participations.map(
      (p: any) => p.marketplace?.countryCode,
    );

    return {
      sellerId,
      sellerName,
      marketplaces,
    };
  }
}

/**
 * Create Amazon connector with environment config
 */
export function createAmazonConnector(
  marketplace: string = "US",
): AmazonConnector {
  const region = getRegionForMarketplace(marketplace);

  return new AmazonConnector({
    clientId: process.env.AMAZON_CLIENT_ID || "",
    clientSecret: process.env.AMAZON_CLIENT_SECRET || "",
    lwaClientId: process.env.AMAZON_LWA_CLIENT_ID || "",
    lwaClientSecret: process.env.AMAZON_LWA_CLIENT_SECRET || "",
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/marketplaces/amazon/callback`,
    region,
    marketplace,
  });
}

/**
 * Determine region from marketplace
 */
function getRegionForMarketplace(marketplace: string): "NA" | "EU" | "FE" {
  const euMarketplaces = ["UK", "DE", "FR", "IT", "ES", "NL"];
  const feMarketplaces = ["JP", "AU"];

  if (euMarketplaces.includes(marketplace)) return "EU";
  if (feMarketplaces.includes(marketplace)) return "FE";
  return "NA";
}
