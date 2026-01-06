/**
 * Postscript SMS Marketing Integration
 *
 * Sync customer data, track SMS attribution, and manage SMS campaigns
 * for e-commerce marketing.
 */

const POSTSCRIPT_API_BASE = "https://api.postscript.io/api/v2";

export interface PostscriptConfig {
  apiKey: string;
  shopId: string;
}

export interface PostscriptSubscriber {
  id?: string;
  phoneNumber: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  tags?: string[];
  properties?: Record<string, any>;
  subscribedAt?: string;
  optedOutAt?: string;
  status?: "subscribed" | "unsubscribed" | "pending";
}

export interface PostscriptCampaign {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "sent" | "cancelled";
  messageBody: string;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
  statistics?: {
    sent: number;
    delivered: number;
    clicked: number;
    revenue: number;
    unsubscribed: number;
  };
}

export interface PostscriptKeyword {
  id: string;
  keyword: string;
  description?: string;
  autoReply?: string;
  tags?: string[];
  createdAt: string;
}

export interface PostscriptMetrics {
  subscriberCount: number;
  messagessSent: number;
  deliveryRate: number;
  clickRate: number;
  revenue: number;
  unsubscribeRate: number;
  averageOrderValue: number;
}

/**
 * Postscript API Client
 */
export class PostscriptClient {
  private apiKey: string;
  private shopId: string;

  constructor(config: PostscriptConfig) {
    this.apiKey = config.apiKey;
    this.shopId = config.shopId;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${POSTSCRIPT_API_BASE}${endpoint}`;

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Postscript-Shop-Id": this.shopId,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Postscript API error: ${response.status} - ${JSON.stringify(error)}`,
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  /**
   * Create or update a subscriber
   */
  async upsertSubscriber(
    subscriber: PostscriptSubscriber,
  ): Promise<{ id: string }> {
    const response = await this.request<{
      subscriber: { id: string };
    }>("/subscribers", {
      method: "POST",
      body: JSON.stringify({
        phone_number: subscriber.phoneNumber,
        email: subscriber.email,
        first_name: subscriber.firstName,
        last_name: subscriber.lastName,
        tags: subscriber.tags,
        properties: subscriber.properties,
      }),
    });

    return { id: response.subscriber.id };
  }

  /**
   * Get subscriber by phone number
   */
  async getSubscriberByPhone(
    phoneNumber: string,
  ): Promise<PostscriptSubscriber | null> {
    try {
      const response = await this.request<{
        subscribers: Array<{
          id: string;
          phone_number: string;
          email?: string;
          first_name?: string;
          last_name?: string;
          tags?: string[];
          properties?: Record<string, any>;
          subscribed_at?: string;
          opted_out_at?: string;
          status: string;
        }>;
      }>(`/subscribers?phone_number=${encodeURIComponent(phoneNumber)}`);

      if (response.subscribers.length === 0) return null;

      const sub = response.subscribers[0];
      return {
        id: sub.id,
        phoneNumber: sub.phone_number,
        email: sub.email,
        firstName: sub.first_name,
        lastName: sub.last_name,
        tags: sub.tags,
        properties: sub.properties,
        subscribedAt: sub.subscribed_at,
        optedOutAt: sub.opted_out_at,
        status: sub.status as PostscriptSubscriber["status"],
      };
    } catch {
      return null;
    }
  }

  /**
   * Add tags to subscriber
   */
  async addTagsToSubscriber(
    subscriberId: string,
    tags: string[],
  ): Promise<void> {
    await this.request(`/subscribers/${subscriberId}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags }),
    });
  }

  /**
   * Remove tags from subscriber
   */
  async removeTagsFromSubscriber(
    subscriberId: string,
    tags: string[],
  ): Promise<void> {
    await this.request(`/subscribers/${subscriberId}/tags`, {
      method: "DELETE",
      body: JSON.stringify({ tags }),
    });
  }

  /**
   * Trigger an event for a subscriber
   */
  async triggerEvent(
    phoneNumber: string,
    eventName: string,
    properties?: Record<string, any>,
  ): Promise<void> {
    await this.request("/events", {
      method: "POST",
      body: JSON.stringify({
        phone_number: phoneNumber,
        event_name: eventName,
        properties,
      }),
    });
  }

  /**
   * Get all campaigns
   */
  async getCampaigns(status?: string): Promise<PostscriptCampaign[]> {
    let endpoint = "/campaigns";
    if (status) {
      endpoint += `?status=${status}`;
    }

    const response = await this.request<{
      campaigns: Array<{
        id: string;
        name: string;
        status: string;
        message_body: string;
        scheduled_at?: string;
        sent_at?: string;
        created_at: string;
        statistics?: {
          sent: number;
          delivered: number;
          clicked: number;
          revenue: number;
          unsubscribed: number;
        };
      }>;
    }>(endpoint);

    return response.campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status as PostscriptCampaign["status"],
      messageBody: campaign.message_body,
      scheduledAt: campaign.scheduled_at,
      sentAt: campaign.sent_at,
      createdAt: campaign.created_at,
      statistics: campaign.statistics,
    }));
  }

  /**
   * Get campaign by ID
   */
  async getCampaign(campaignId: string): Promise<PostscriptCampaign> {
    const response = await this.request<{
      campaign: {
        id: string;
        name: string;
        status: string;
        message_body: string;
        scheduled_at?: string;
        sent_at?: string;
        created_at: string;
        statistics?: {
          sent: number;
          delivered: number;
          clicked: number;
          revenue: number;
          unsubscribed: number;
        };
      };
    }>(`/campaigns/${campaignId}`);

    return {
      id: response.campaign.id,
      name: response.campaign.name,
      status: response.campaign.status as PostscriptCampaign["status"],
      messageBody: response.campaign.message_body,
      scheduledAt: response.campaign.scheduled_at,
      sentAt: response.campaign.sent_at,
      createdAt: response.campaign.created_at,
      statistics: response.campaign.statistics,
    };
  }

  /**
   * Get keywords
   */
  async getKeywords(): Promise<PostscriptKeyword[]> {
    const response = await this.request<{
      keywords: Array<{
        id: string;
        keyword: string;
        description?: string;
        auto_reply?: string;
        tags?: string[];
        created_at: string;
      }>;
    }>("/keywords");

    return response.keywords.map((keyword) => ({
      id: keyword.id,
      keyword: keyword.keyword,
      description: keyword.description,
      autoReply: keyword.auto_reply,
      tags: keyword.tags,
      createdAt: keyword.created_at,
    }));
  }

  /**
   * Get shop metrics
   */
  async getMetrics(startDate: Date, endDate: Date): Promise<PostscriptMetrics> {
    const response = await this.request<{
      metrics: {
        subscriber_count: number;
        messages_sent: number;
        delivery_rate: number;
        click_rate: number;
        revenue: number;
        unsubscribe_rate: number;
        average_order_value: number;
      };
    }>(
      `/metrics?start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}`,
    );

    return {
      subscriberCount: response.metrics.subscriber_count,
      messagessSent: response.metrics.messages_sent,
      deliveryRate: response.metrics.delivery_rate,
      clickRate: response.metrics.click_rate,
      revenue: response.metrics.revenue,
      unsubscribeRate: response.metrics.unsubscribe_rate,
      averageOrderValue: response.metrics.average_order_value,
    };
  }

  /**
   * Send transactional message
   */
  async sendTransactionalMessage(
    phoneNumber: string,
    messageBody: string,
    mediaUrl?: string,
  ): Promise<{ messageId: string }> {
    const response = await this.request<{
      message: { id: string };
    }>("/messages", {
      method: "POST",
      body: JSON.stringify({
        phone_number: phoneNumber,
        body: messageBody,
        media_url: mediaUrl,
        message_type: "transactional",
      }),
    });

    return { messageId: response.message.id };
  }
}

/**
 * Track attributed purchase via Postscript
 */
export async function trackAttributedPurchaseSMS(
  client: PostscriptClient,
  params: {
    phoneNumber: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    orderId: string;
    orderValue: number;
    currency: string;
    items: Array<{
      productName: string;
      quantity: number;
      price: number;
    }>;
    attribution: {
      source?: string;
      medium?: string;
      campaign?: string;
      gclid?: string;
      fbclid?: string;
      ttclid?: string;
    };
    isNewCustomer: boolean;
  },
): Promise<void> {
  // Upsert subscriber with attribution tags
  const tags: string[] = [];

  if (params.attribution.source) {
    tags.push(`source:${params.attribution.source}`);
  }
  if (params.attribution.medium) {
    tags.push(`medium:${params.attribution.medium}`);
  }
  if (params.attribution.gclid) {
    tags.push("channel:google_ads");
  }
  if (params.attribution.fbclid) {
    tags.push("channel:meta_ads");
  }
  if (params.attribution.ttclid) {
    tags.push("channel:tiktok_ads");
  }
  if (params.isNewCustomer) {
    tags.push("customer_type:new");
  } else {
    tags.push("customer_type:returning");
  }

  // Determine value tier
  if (params.orderValue >= 200) {
    tags.push("value_tier:high");
  } else if (params.orderValue >= 50) {
    tags.push("value_tier:medium");
  } else {
    tags.push("value_tier:low");
  }

  await client.upsertSubscriber({
    phoneNumber: params.phoneNumber,
    email: params.email,
    firstName: params.firstName,
    lastName: params.lastName,
    tags,
    properties: {
      last_order_value: params.orderValue,
      last_order_date: new Date().toISOString(),
      attribution_source: params.attribution.source,
      attribution_medium: params.attribution.medium,
      is_new_customer: params.isNewCustomer,
    },
  });

  // Trigger purchase event for automations
  await client.triggerEvent(params.phoneNumber, "order_placed", {
    order_id: params.orderId,
    order_value: params.orderValue,
    currency: params.currency,
    item_count: params.items.length,
    items: params.items,
    is_new_customer: params.isNewCustomer,
    attribution_source: params.attribution.source,
  });
}

/**
 * Get SMS marketing performance
 */
export async function getSMSPerformance(
  client: PostscriptClient,
  startDate: Date,
  endDate: Date,
): Promise<{
  campaigns: PostscriptCampaign[];
  metrics: PostscriptMetrics;
  topPerformers: Array<{
    campaignId: string;
    name: string;
    revenue: number;
    roas: number;
  }>;
}> {
  const [campaigns, metrics] = await Promise.all([
    client.getCampaigns("sent"),
    client.getMetrics(startDate, endDate),
  ]);

  // Filter campaigns in date range
  const campaignsInRange = campaigns.filter((c) => {
    if (!c.sentAt) return false;
    const sentDate = new Date(c.sentAt);
    return sentDate >= startDate && sentDate <= endDate;
  });

  // Calculate top performers by revenue
  const topPerformers = campaignsInRange
    .filter((c) => c.statistics?.revenue)
    .map((c) => ({
      campaignId: c.id,
      name: c.name,
      revenue: c.statistics?.revenue || 0,
      roas: c.statistics?.sent
        ? (c.statistics.revenue || 0) / (c.statistics.sent * 0.02) // Assume $0.02 per SMS
        : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    campaigns: campaignsInRange,
    metrics,
    topPerformers,
  };
}

/**
 * Sync customer segments to Postscript tags
 */
export async function syncSegmentsToTags(
  client: PostscriptClient,
  segments: Array<{
    tagName: string;
    subscribers: Array<{
      phoneNumber: string;
      email?: string;
      firstName?: string;
      lastName?: string;
    }>;
  }>,
): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;

  for (const segment of segments) {
    for (const subscriber of segment.subscribers) {
      try {
        // First upsert the subscriber
        const result = await client.upsertSubscriber({
          phoneNumber: subscriber.phoneNumber,
          email: subscriber.email,
          firstName: subscriber.firstName,
          lastName: subscriber.lastName,
          tags: [segment.tagName],
        });

        synced++;
      } catch {
        errors++;
      }
    }
  }

  return { synced, errors };
}
