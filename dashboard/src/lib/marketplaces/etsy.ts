/**
 * Etsy Open API Connector
 *
 * Integrates with Etsy for:
 * - Orders (receipts) and transactions
 * - Fees calculation
 * - Etsy Ads spend
 */

import {
  MarketplaceConnector,
  MarketplaceOrder,
  MarketplaceAdSpend,
  ConnectorConfig,
} from "./types";

const ETSY_ENDPOINTS = {
  auth: "https://api.etsy.com/v3/public/oauth/token",
  authPage: "https://www.etsy.com/oauth/connect",
  api: "https://api.etsy.com/v3",
};

export interface EtsyConfig extends ConnectorConfig {
  keyString: string; // Etsy API keystring (shared with OAuth)
}

export class EtsyConnector implements MarketplaceConnector {
  platform = "etsy" as const;
  private config: EtsyConfig;

  constructor(config: EtsyConfig) {
    this.config = config;
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthUrl(state: string): string {
    // Etsy uses PKCE for OAuth 2.0
    const scopes = [
      "transactions_r",
      "transactions_w",
      "listings_r",
      "shops_r",
      "billing_r",
    ];

    const params = new URLSearchParams({
      response_type: "code",
      redirect_uri: this.config.redirectUri,
      scope: scopes.join(" "),
      client_id: this.config.keyString,
      state,
      code_challenge: this.generateCodeChallenge(state),
      code_challenge_method: "S256",
    });

    return `${ETSY_ENDPOINTS.authPage}?${params.toString()}`;
  }

  /**
   * Generate PKCE code challenge
   */
  private generateCodeChallenge(verifier: string): string {
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256").update(verifier).digest("base64");
    return hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    codeVerifier?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const response = await fetch(ETSY_ENDPOINTS.auth, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.config.keyString,
        redirect_uri: this.config.redirectUri,
        code,
        code_verifier: codeVerifier || "",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Etsy token exchange failed: ${error}`);
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
    const response = await fetch(ETSY_ENDPOINTS.auth, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.config.keyString,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Etsy token refresh failed: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Fetch orders (receipts) from Etsy
   */
  async getOrders(params: {
    accessToken: string;
    startDate: Date;
    endDate: Date;
    nextToken?: string;
    shopId?: string;
  }): Promise<{ orders: MarketplaceOrder[]; nextToken?: string }> {
    // First, get the shop ID if not provided
    const shopId = params.shopId || (await this.getShopId(params.accessToken));

    const queryParams = new URLSearchParams({
      min_created: Math.floor(params.startDate.getTime() / 1000).toString(),
      max_created: Math.floor(params.endDate.getTime() / 1000).toString(),
      limit: "100",
    });

    if (params.nextToken) {
      queryParams.set("offset", params.nextToken);
    }

    const response = await fetch(
      `${ETSY_ENDPOINTS.api}/application/shops/${shopId}/receipts?${queryParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "x-api-key": this.config.keyString,
        },
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Etsy orders fetch failed: ${error}`);
    }

    const data = await response.json();
    const orders = (data.results || []).map((receipt: any) =>
      this.transformReceipt(receipt),
    );

    // Calculate next offset
    const offset = parseInt(params.nextToken || "0", 10);
    const count = data.count || 0;
    const nextOffset = offset + orders.length;

    return {
      orders,
      nextToken: nextOffset < count ? nextOffset.toString() : undefined,
    };
  }

  /**
   * Get shop ID for the authenticated user
   */
  private async getShopId(accessToken: string): Promise<string> {
    const response = await fetch(`${ETSY_ENDPOINTS.api}/application/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-api-key": this.config.keyString,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get Etsy user info");
    }

    const data = await response.json();
    return data.shop_id?.toString() || "";
  }

  /**
   * Transform Etsy receipt to common order format
   */
  private transformReceipt(receipt: any): MarketplaceOrder {
    const transactions = receipt.transactions || [];

    const lineItems = transactions.map((tx: any) => ({
      id: tx.transaction_id?.toString(),
      sku: tx.product_data?.sku,
      title: tx.title,
      quantity: tx.quantity || 1,
      price: parseFloat(tx.price?.amount || "0") / 100, // Etsy uses cents
      fees: this.calculateTransactionFees(tx),
    }));

    const totalFees = this.calculateReceiptFees(receipt);

    return {
      id: receipt.receipt_id?.toString(),
      externalId: receipt.receipt_id?.toString(),
      orderNumber: receipt.receipt_id?.toString(),
      platform: "etsy",
      status: this.mapReceiptStatus(receipt.status),
      total: parseFloat(receipt.grandtotal?.amount || "0") / 100,
      subtotal: parseFloat(receipt.subtotal?.amount || "0") / 100,
      tax: parseFloat(receipt.total_tax_cost?.amount || "0") / 100,
      shipping: parseFloat(receipt.total_shipping_cost?.amount || "0") / 100,
      fees: totalFees,
      currency: receipt.grandtotal?.currency_code || "USD",
      customerEmail: receipt.buyer_email,
      customerName: receipt.name,
      items: lineItems,
      createdAt: new Date(receipt.create_timestamp * 1000),
      updatedAt: new Date(receipt.update_timestamp * 1000),
    };
  }

  /**
   * Calculate fees for a transaction
   */
  private calculateTransactionFees(transaction: any): number {
    // Etsy transaction fee: 6.5% + $0.20
    // Payment processing: 3% + $0.25
    const price = parseFloat(transaction.price?.amount || "0") / 100;
    const quantity = transaction.quantity || 1;
    const subtotal = price * quantity;

    const transactionFee = subtotal * 0.065 + 0.2;
    const paymentFee = subtotal * 0.03 + 0.25;

    return transactionFee + paymentFee;
  }

  /**
   * Calculate total fees for a receipt
   */
  private calculateReceiptFees(receipt: any): number {
    const transactions = receipt.transactions || [];
    let fees = 0;

    for (const tx of transactions) {
      fees += this.calculateTransactionFees(tx);
    }

    // Shipping label fee if applicable
    if (receipt.shipping_cost?.amount) {
      const shippingCost = parseFloat(receipt.shipping_cost.amount) / 100;
      fees += shippingCost * 0.065; // Transaction fee on shipping
    }

    return fees;
  }

  /**
   * Map Etsy receipt status to common status
   */
  private mapReceiptStatus(status: string): string {
    const statusMap: Record<string, string> = {
      open: "processing",
      paid: "processing",
      completed: "shipped",
      closed: "shipped",
      cancelled: "cancelled",
    };
    return statusMap[status?.toLowerCase()] || "unknown";
  }

  /**
   * Fetch Etsy Ads spend
   */
  async getAdSpend(params: {
    accessToken: string;
    startDate: Date;
    endDate: Date;
    shopId?: string;
  }): Promise<MarketplaceAdSpend[]> {
    const shopId = params.shopId || (await this.getShopId(params.accessToken));

    // Get shop budget (overall ads settings)
    const budgetResponse = await fetch(
      `${ETSY_ENDPOINTS.api}/application/shops/${shopId}/shop-budget`,
      {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "x-api-key": this.config.keyString,
        },
      },
    );

    if (!budgetResponse.ok) {
      console.error("Etsy Ads budget fetch failed");
      return [];
    }

    // Get listings that are being promoted
    const listingsResponse = await fetch(
      `${ETSY_ENDPOINTS.api}/application/shops/${shopId}/listings/active?includes=MainImage`,
      {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "x-api-key": this.config.keyString,
        },
      },
    );

    if (!listingsResponse.ok) {
      return [];
    }

    const budgetData = await budgetResponse.json();
    const listingsData = await listingsResponse.json();

    // Note: Etsy doesn't provide detailed ad performance via API
    // We can only get the daily budget and estimate spend
    const dailyBudget = budgetData.daily_budget?.amount || 0;
    const daysDiff = Math.ceil(
      (params.endDate.getTime() - params.startDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const estimatedSpend = (dailyBudget / 100) * daysDiff;

    // Return aggregated ad spend
    return [
      {
        platform: "etsy",
        campaignId: `etsy-ads-${shopId}`,
        campaignName: "Etsy Ads",
        spend: estimatedSpend,
        impressions: 0, // Not available via API
        clicks: 0, // Not available via API
        sales: 0, // Would need to correlate with orders
        currency: budgetData.daily_budget?.currency_code || "USD",
        date: params.startDate,
      },
    ];
  }

  /**
   * Get seller (shop) information
   */
  async getSellerInfo(
    accessToken: string,
  ): Promise<{ sellerId: string; sellerName: string; marketplaces: string[] }> {
    // Get user info first
    const userResponse = await fetch(
      `${ETSY_ENDPOINTS.api}/application/users/me`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-api-key": this.config.keyString,
        },
      },
    );

    if (!userResponse.ok) {
      throw new Error("Failed to get Etsy user info");
    }

    const userData = await userResponse.json();
    const shopId = userData.shop_id;

    // Get shop details
    if (shopId) {
      const shopResponse = await fetch(
        `${ETSY_ENDPOINTS.api}/application/shops/${shopId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "x-api-key": this.config.keyString,
          },
        },
      );

      if (shopResponse.ok) {
        const shopData = await shopResponse.json();
        return {
          sellerId: shopId.toString(),
          sellerName: shopData.shop_name || userData.login_name,
          marketplaces: ["ETSY"], // Etsy is a single marketplace
        };
      }
    }

    return {
      sellerId: userData.user_id?.toString() || "unknown",
      sellerName: userData.login_name || "Etsy Seller",
      marketplaces: ["ETSY"],
    };
  }
}

/**
 * Create Etsy connector with environment config
 */
export function createEtsyConnector(): EtsyConnector {
  return new EtsyConnector({
    clientId: process.env.ETSY_API_KEY || "",
    clientSecret: process.env.ETSY_SHARED_SECRET || "",
    keyString: process.env.ETSY_API_KEY || "",
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/api/marketplaces/etsy/callback`,
  });
}
