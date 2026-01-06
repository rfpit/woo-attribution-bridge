/**
 * Klaviyo Email Marketing Integration
 *
 * Sync customer data, track email attribution, and trigger flows
 * based on attribution and purchase behavior.
 */

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const KLAVIYO_API_VERSION = "2024-10-15";

export interface KlaviyoConfig {
  apiKey: string;
  publicApiKey?: string;
}

export interface KlaviyoProfile {
  id?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  properties?: Record<string, any>;
}

export interface KlaviyoEvent {
  eventName: string;
  profile: KlaviyoProfile;
  properties?: Record<string, any>;
  time?: Date;
  value?: number;
  uniqueId?: string;
}

export interface KlaviyoList {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  optInProcess: string;
}

export interface KlaviyoCampaign {
  id: string;
  name: string;
  status: string;
  sendTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KlaviyoMetrics {
  opens: number;
  clicks: number;
  unsubscribes: number;
  revenue: number;
  conversions: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
}

/**
 * Klaviyo API Client
 */
export class KlaviyoClient {
  private apiKey: string;
  private publicApiKey?: string;

  constructor(config: KlaviyoConfig) {
    this.apiKey = config.apiKey;
    this.publicApiKey = config.publicApiKey;
  }

  /**
   * Make authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${KLAVIYO_API_BASE}${endpoint}`;

    const headers = {
      Authorization: `Klaviyo-API-Key ${this.apiKey}`,
      revision: KLAVIYO_API_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Klaviyo API error: ${response.status} - ${JSON.stringify(error)}`,
      );
    }

    // Some endpoints return 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  /**
   * Create or update a profile
   */
  async upsertProfile(profile: KlaviyoProfile): Promise<{ id: string }> {
    const response = await this.request<{ data: { id: string } }>(
      "/profiles/",
      {
        method: "POST",
        body: JSON.stringify({
          data: {
            type: "profile",
            attributes: {
              email: profile.email,
              first_name: profile.firstName,
              last_name: profile.lastName,
              phone_number: profile.phoneNumber,
              properties: profile.properties,
            },
          },
        }),
      },
    );

    return { id: response.data.id };
  }

  /**
   * Get profile by email
   */
  async getProfileByEmail(email: string): Promise<KlaviyoProfile | null> {
    try {
      const response = await this.request<{
        data: Array<{
          id: string;
          attributes: {
            email: string;
            first_name?: string;
            last_name?: string;
            phone_number?: string;
            properties?: Record<string, any>;
          };
        }>;
      }>(`/profiles/?filter=equals(email,"${encodeURIComponent(email)}")`);

      if (response.data.length === 0) return null;

      const profile = response.data[0];
      return {
        id: profile.id,
        email: profile.attributes.email,
        firstName: profile.attributes.first_name,
        lastName: profile.attributes.last_name,
        phoneNumber: profile.attributes.phone_number,
        properties: profile.attributes.properties,
      };
    } catch {
      return null;
    }
  }

  /**
   * Track an event
   */
  async trackEvent(event: KlaviyoEvent): Promise<void> {
    await this.request("/events/", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "event",
          attributes: {
            profile: {
              data: {
                type: "profile",
                attributes: {
                  email: event.profile.email,
                  first_name: event.profile.firstName,
                  last_name: event.profile.lastName,
                  phone_number: event.profile.phoneNumber,
                  properties: event.profile.properties,
                },
              },
            },
            metric: {
              data: {
                type: "metric",
                attributes: {
                  name: event.eventName,
                },
              },
            },
            properties: event.properties,
            time: event.time?.toISOString() || new Date().toISOString(),
            value: event.value,
            unique_id: event.uniqueId,
          },
        },
      }),
    });
  }

  /**
   * Get all lists
   */
  async getLists(): Promise<KlaviyoList[]> {
    const response = await this.request<{
      data: Array<{
        id: string;
        attributes: {
          name: string;
          created: string;
          updated: string;
          opt_in_process: string;
        };
      }>;
    }>("/lists/");

    return response.data.map((list) => ({
      id: list.id,
      name: list.attributes.name,
      createdAt: list.attributes.created,
      updatedAt: list.attributes.updated,
      optInProcess: list.attributes.opt_in_process,
    }));
  }

  /**
   * Subscribe profile to list
   */
  async subscribeToList(
    listId: string,
    profile: KlaviyoProfile,
  ): Promise<void> {
    await this.request(`/lists/${listId}/relationships/profiles/`, {
      method: "POST",
      body: JSON.stringify({
        data: [
          {
            type: "profile",
            attributes: {
              email: profile.email,
              first_name: profile.firstName,
              last_name: profile.lastName,
              phone_number: profile.phoneNumber,
              properties: profile.properties,
            },
          },
        ],
      }),
    });
  }

  /**
   * Get campaigns
   */
  async getCampaigns(status?: string): Promise<KlaviyoCampaign[]> {
    let endpoint = "/campaigns/";
    if (status) {
      endpoint += `?filter=equals(status,"${status}")`;
    }

    const response = await this.request<{
      data: Array<{
        id: string;
        attributes: {
          name: string;
          status: string;
          send_time?: string;
          created: string;
          updated: string;
        };
      }>;
    }>(endpoint);

    return response.data.map((campaign) => ({
      id: campaign.id,
      name: campaign.attributes.name,
      status: campaign.attributes.status,
      sendTime: campaign.attributes.send_time,
      createdAt: campaign.attributes.created,
      updatedAt: campaign.attributes.updated,
    }));
  }

  /**
   * Get campaign metrics
   */
  async getCampaignMetrics(
    campaignId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<KlaviyoMetrics> {
    // Klaviyo's reporting API requires specific metric queries
    // This is a simplified version - full implementation would use the reporting API
    const response = await this.request<{
      data: {
        attributes: {
          results: Array<{
            metric: string;
            value: number;
          }>;
        };
      };
    }>(
      `/campaign-values-reports/?campaign_id=${campaignId}&start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}`,
    );

    const results = response.data?.attributes?.results || [];
    const metrics: KlaviyoMetrics = {
      opens: 0,
      clicks: 0,
      unsubscribes: 0,
      revenue: 0,
      conversions: 0,
      deliveryRate: 0,
      openRate: 0,
      clickRate: 0,
    };

    for (const result of results) {
      switch (result.metric) {
        case "Opened Email":
          metrics.opens = result.value;
          break;
        case "Clicked Email":
          metrics.clicks = result.value;
          break;
        case "Unsubscribed":
          metrics.unsubscribes = result.value;
          break;
        case "Placed Order":
          metrics.conversions = result.value;
          break;
      }
    }

    return metrics;
  }

  /**
   * Get flows
   */
  async getFlows(): Promise<
    Array<{ id: string; name: string; status: string; triggerType: string }>
  > {
    const response = await this.request<{
      data: Array<{
        id: string;
        attributes: {
          name: string;
          status: string;
          trigger_type: string;
        };
      }>;
    }>("/flows/");

    return response.data.map((flow) => ({
      id: flow.id,
      name: flow.attributes.name,
      status: flow.attributes.status,
      triggerType: flow.attributes.trigger_type,
    }));
  }
}

/**
 * Track attribution-enriched purchase event in Klaviyo
 */
export async function trackAttributedPurchase(
  client: KlaviyoClient,
  params: {
    email: string;
    firstName?: string;
    lastName?: string;
    orderId: string;
    orderValue: number;
    currency: string;
    items: Array<{
      productId: string;
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
  // Upsert profile with attribution data
  await client.upsertProfile({
    email: params.email,
    firstName: params.firstName,
    lastName: params.lastName,
    properties: {
      attribution_source: params.attribution.source,
      attribution_medium: params.attribution.medium,
      attribution_campaign: params.attribution.campaign,
      has_gclid: !!params.attribution.gclid,
      has_fbclid: !!params.attribution.fbclid,
      has_ttclid: !!params.attribution.ttclid,
      acquisition_channel: determineChannel(params.attribution),
      is_new_customer: params.isNewCustomer,
    },
  });

  // Track purchase event
  await client.trackEvent({
    eventName: "Placed Order",
    profile: {
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
    },
    properties: {
      $event_id: params.orderId,
      $value: params.orderValue,
      Currency: params.currency,
      ItemNames: params.items.map((i) => i.productName),
      Items: params.items.map((i) => ({
        ProductID: i.productId,
        ProductName: i.productName,
        Quantity: i.quantity,
        ItemPrice: i.price,
      })),
      attribution_source: params.attribution.source,
      attribution_medium: params.attribution.medium,
      attribution_campaign: params.attribution.campaign,
      is_attributed: !!(
        params.attribution.source ||
        params.attribution.gclid ||
        params.attribution.fbclid
      ),
      acquisition_channel: determineChannel(params.attribution),
    },
    value: params.orderValue,
    uniqueId: params.orderId,
  });
}

/**
 * Determine acquisition channel from attribution data
 */
function determineChannel(attribution: {
  source?: string;
  medium?: string;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
}): string {
  if (attribution.gclid) return "Google Ads";
  if (attribution.fbclid) return "Meta Ads";
  if (attribution.ttclid) return "TikTok Ads";
  if (attribution.medium === "cpc" || attribution.medium === "ppc")
    return "Paid Search";
  if (attribution.medium === "email") return "Email";
  if (attribution.medium === "social") return "Social";
  if (attribution.source === "google" || attribution.source === "bing")
    return "Organic Search";
  if (attribution.source) return attribution.source;
  return "Direct";
}

/**
 * Sync customer segments to Klaviyo lists
 */
export async function syncSegmentsToLists(
  client: KlaviyoClient,
  segments: {
    listId: string;
    profiles: KlaviyoProfile[];
  }[],
): Promise<{ synced: number; errors: number }> {
  let synced = 0;
  let errors = 0;

  for (const segment of segments) {
    for (const profile of segment.profiles) {
      try {
        await client.subscribeToList(segment.listId, profile);
        synced++;
      } catch {
        errors++;
      }
    }
  }

  return { synced, errors };
}

/**
 * Get email marketing performance metrics
 */
export async function getEmailPerformance(
  client: KlaviyoClient,
  startDate: Date,
  endDate: Date,
): Promise<{
  campaigns: Array<KlaviyoCampaign & { metrics: KlaviyoMetrics }>;
  totals: KlaviyoMetrics;
}> {
  const campaigns = await client.getCampaigns("sent");
  const campaignsWithMetrics: Array<
    KlaviyoCampaign & { metrics: KlaviyoMetrics }
  > = [];

  const totals: KlaviyoMetrics = {
    opens: 0,
    clicks: 0,
    unsubscribes: 0,
    revenue: 0,
    conversions: 0,
    deliveryRate: 0,
    openRate: 0,
    clickRate: 0,
  };

  for (const campaign of campaigns) {
    const campaignSendTime = campaign.sendTime
      ? new Date(campaign.sendTime)
      : null;

    if (
      campaignSendTime &&
      campaignSendTime >= startDate &&
      campaignSendTime <= endDate
    ) {
      const metrics = await client.getCampaignMetrics(
        campaign.id,
        startDate,
        endDate,
      );

      campaignsWithMetrics.push({ ...campaign, metrics });

      totals.opens += metrics.opens;
      totals.clicks += metrics.clicks;
      totals.unsubscribes += metrics.unsubscribes;
      totals.revenue += metrics.revenue;
      totals.conversions += metrics.conversions;
    }
  }

  // Calculate rates
  if (totals.opens > 0) {
    totals.clickRate = (totals.clicks / totals.opens) * 100;
  }

  return { campaigns: campaignsWithMetrics, totals };
}
