/**
 * Shopify API Client
 *
 * Handles OAuth authentication and API requests to Shopify stores.
 */

export interface ShopifyConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string[];
  hostName: string;
}

export interface ShopifySession {
  shop: string;
  accessToken: string;
  scope: string;
  expiresAt?: Date;
}

export interface ShopifyOrder {
  id: number;
  email: string;
  totalPrice: string;
  currency: string;
  financialStatus: string;
  fulfilledAt: string | null;
  createdAt: string;
  lineItems: ShopifyLineItem[];
  customer: ShopifyCustomer | null;
  landingSite: string | null;
  referringSite: string | null;
  sourceUrl: string | null;
  clientDetails: {
    browserIp: string;
    userAgent: string;
  } | null;
  noteAttributes: Array<{ name: string; value: string }>;
}

export interface ShopifyLineItem {
  id: number;
  productId: number | null;
  variantId: number | null;
  title: string;
  quantity: number;
  price: string;
  sku: string;
}

export interface ShopifyCustomer {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  ordersCount: number;
  totalSpent: string;
  createdAt: string;
}

const SHOPIFY_API_VERSION = "2024-01";

/**
 * Generate OAuth authorization URL for Shopify
 */
export function getShopifyAuthUrl(
  shop: string,
  config: ShopifyConfig,
  state: string,
  redirectUri: string,
): string {
  const params = new URLSearchParams({
    client_id: config.apiKey,
    scope: config.scopes.join(","),
    redirect_uri: redirectUri,
    state,
    "grant_options[]": "per-user",
  });

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  shop: string,
  code: string,
  config: ShopifyConfig,
): Promise<ShopifySession> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: config.apiKey,
      client_secret: config.apiSecret,
      code,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  const data = await response.json();

  return {
    shop,
    accessToken: data.access_token,
    scope: data.scope,
  };
}

/**
 * Shopify API client class
 */
export class ShopifyClient {
  private shop: string;
  private accessToken: string;
  private apiVersion: string;

  constructor(
    shop: string,
    accessToken: string,
    apiVersion = SHOPIFY_API_VERSION,
  ) {
    this.shop = shop;
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
  }

  private get baseUrl(): string {
    return `https://${this.shop}/admin/api/${this.apiVersion}`;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.accessToken,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get shop information
   */
  async getShop(): Promise<{
    id: number;
    name: string;
    email: string;
    domain: string;
    currency: string;
    timezone: string;
  }> {
    const data = await this.request<{ shop: any }>("/shop.json");
    return {
      id: data.shop.id,
      name: data.shop.name,
      email: data.shop.email,
      domain: data.shop.domain,
      currency: data.shop.currency,
      timezone: data.shop.iana_timezone,
    };
  }

  /**
   * Get orders with pagination
   */
  async getOrders(
    params: {
      limit?: number;
      sinceId?: number;
      createdAtMin?: string;
      createdAtMax?: string;
      status?: "open" | "closed" | "cancelled" | "any";
      financialStatus?: string;
    } = {},
  ): Promise<ShopifyOrder[]> {
    const queryParams = new URLSearchParams();

    if (params.limit) queryParams.set("limit", params.limit.toString());
    if (params.sinceId) queryParams.set("since_id", params.sinceId.toString());
    if (params.createdAtMin)
      queryParams.set("created_at_min", params.createdAtMin);
    if (params.createdAtMax)
      queryParams.set("created_at_max", params.createdAtMax);
    if (params.status) queryParams.set("status", params.status);
    if (params.financialStatus)
      queryParams.set("financial_status", params.financialStatus);

    const query = queryParams.toString();
    const endpoint = `/orders.json${query ? `?${query}` : ""}`;

    const data = await this.request<{ orders: any[] }>(endpoint);

    return data.orders.map(this.transformOrder);
  }

  /**
   * Get single order
   */
  async getOrder(orderId: number): Promise<ShopifyOrder> {
    const data = await this.request<{ order: any }>(`/orders/${orderId}.json`);
    return this.transformOrder(data.order);
  }

  /**
   * Get customer
   */
  async getCustomer(customerId: number): Promise<ShopifyCustomer> {
    const data = await this.request<{ customer: any }>(
      `/customers/${customerId}.json`,
    );
    return {
      id: data.customer.id,
      email: data.customer.email,
      firstName: data.customer.first_name,
      lastName: data.customer.last_name,
      ordersCount: data.customer.orders_count,
      totalSpent: data.customer.total_spent,
      createdAt: data.customer.created_at,
    };
  }

  /**
   * Create webhook subscription
   */
  async createWebhook(
    topic: string,
    address: string,
    format: "json" | "xml" = "json",
  ): Promise<{ id: number; topic: string; address: string }> {
    const data = await this.request<{ webhook: any }>("/webhooks.json", {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          topic,
          address,
          format,
        },
      }),
    });

    return {
      id: data.webhook.id,
      topic: data.webhook.topic,
      address: data.webhook.address,
    };
  }

  /**
   * List webhook subscriptions
   */
  async listWebhooks(): Promise<
    Array<{ id: number; topic: string; address: string }>
  > {
    const data = await this.request<{ webhooks: any[] }>("/webhooks.json");

    return data.webhooks.map((w) => ({
      id: w.id,
      topic: w.topic,
      address: w.address,
    }));
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId: number): Promise<void> {
    await this.request(`/webhooks/${webhookId}.json`, {
      method: "DELETE",
    });
  }

  /**
   * Add order note (for storing attribution data)
   */
  async addOrderNote(orderId: number, note: string): Promise<void> {
    await this.request(`/orders/${orderId}.json`, {
      method: "PUT",
      body: JSON.stringify({
        order: {
          note,
        },
      }),
    });
  }

  /**
   * Add metafield to order (for structured attribution data)
   */
  async addOrderMetafield(
    orderId: number,
    namespace: string,
    key: string,
    value: string,
    type: string = "json",
  ): Promise<void> {
    await this.request(`/orders/${orderId}/metafields.json`, {
      method: "POST",
      body: JSON.stringify({
        metafield: {
          namespace,
          key,
          value,
          type,
        },
      }),
    });
  }

  /**
   * Get order metafields
   */
  async getOrderMetafields(orderId: number): Promise<
    Array<{
      namespace: string;
      key: string;
      value: string;
      type: string;
    }>
  > {
    const data = await this.request<{ metafields: any[] }>(
      `/orders/${orderId}/metafields.json`,
    );

    return data.metafields.map((m) => ({
      namespace: m.namespace,
      key: m.key,
      value: m.value,
      type: m.type,
    }));
  }

  /**
   * Transform Shopify order to our format
   */
  private transformOrder(order: any): ShopifyOrder {
    return {
      id: order.id,
      email: order.email || "",
      totalPrice: order.total_price,
      currency: order.currency,
      financialStatus: order.financial_status,
      fulfilledAt: order.fulfilled_at,
      createdAt: order.created_at,
      lineItems: order.line_items.map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        variantId: item.variant_id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        sku: item.sku || "",
      })),
      customer: order.customer
        ? {
            id: order.customer.id,
            email: order.customer.email,
            firstName: order.customer.first_name,
            lastName: order.customer.last_name,
            ordersCount: order.customer.orders_count,
            totalSpent: order.customer.total_spent,
            createdAt: order.customer.created_at,
          }
        : null,
      landingSite: order.landing_site,
      referringSite: order.referring_site,
      sourceUrl: order.source_url,
      clientDetails: order.client_details
        ? {
            browserIp: order.client_details.browser_ip,
            userAgent: order.client_details.user_agent,
          }
        : null,
      noteAttributes: order.note_attributes || [],
    };
  }
}

/**
 * Extract click IDs from Shopify order landing site URL
 */
export function extractClickIds(
  landingSite: string | null,
): Record<string, string> {
  if (!landingSite) return {};

  try {
    const url = new URL(landingSite);
    const clickIds: Record<string, string> = {};

    const clickIdParams = ["gclid", "fbclid", "ttclid", "msclkid", "dclid"];

    for (const param of clickIdParams) {
      const value = url.searchParams.get(param);
      if (value) {
        clickIds[param] = value;
      }
    }

    return clickIds;
  } catch {
    return {};
  }
}

/**
 * Extract UTM parameters from Shopify order landing site URL
 */
export function extractUtmParams(
  landingSite: string | null,
): Record<string, string> {
  if (!landingSite) return {};

  try {
    const url = new URL(landingSite);
    const utmParams: Record<string, string> = {};

    const params = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
    ];

    for (const param of params) {
      const value = url.searchParams.get(param);
      if (value) {
        utmParams[param] = value;
      }
    }

    return utmParams;
  } catch {
    return {};
  }
}
