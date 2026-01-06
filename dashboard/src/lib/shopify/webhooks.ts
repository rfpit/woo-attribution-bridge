/**
 * Shopify Webhook Handler
 *
 * Processes incoming webhooks from Shopify stores.
 */

import crypto from "crypto";
import {
  ShopifyClient,
  ShopifyOrder,
  extractClickIds,
  extractUtmParams,
} from "./client";
import { db } from "@/lib/db";

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";

export interface ShopifyWebhookPayload {
  topic: string;
  shop: string;
  body: any;
}

/**
 * Verify Shopify webhook signature
 */
export function verifyWebhook(
  body: string,
  signature: string,
  secret: string = SHOPIFY_API_SECRET,
): boolean {
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
}

/**
 * Handle orders/create webhook
 */
export async function handleOrderCreated(
  shop: string,
  order: any,
): Promise<void> {
  // Find the store in our database
  const store = await db.store.findFirst({
    where: {
      domain: shop,
      platform: "shopify",
    },
  });

  if (!store) {
    console.error(`[Shopify] Store not found: ${shop}`);
    return;
  }

  // Extract attribution data from landing site
  const clickIds = extractClickIds(order.landing_site);
  const utmParams = extractUtmParams(order.landing_site);

  // Build attribution object
  const attribution = {
    ...clickIds,
    utm: utmParams,
    landing_page: order.landing_site,
    referrer: order.referring_site,
    source_url: order.source_url,
    captured_at: new Date().toISOString(),
    visitor_id: generateVisitorId(order),
  };

  // Store the attribution data
  await db.attribution.create({
    data: {
      storeId: store.id,
      orderId: order.id.toString(),
      orderNumber: order.order_number?.toString() || order.name,
      email: order.email || "",
      total: order.total_price,
      currency: order.currency,
      clickIds: JSON.stringify(clickIds),
      utmParams: JSON.stringify(utmParams),
      attribution: JSON.stringify(attribution),
      landingPage: order.landing_site,
      referrer: order.referring_site,
      userAgent: order.client_details?.user_agent || null,
      ipHash: order.client_details?.browser_ip
        ? hashIp(order.client_details.browser_ip)
        : null,
      isNewCustomer: order.customer?.orders_count === 1,
      createdAt: new Date(order.created_at),
    },
  });

  // Dispatch to ad platforms
  await dispatchConversions(store.id, order, attribution);

  console.log(
    `[Shopify] Order ${order.id} from ${shop} processed with attribution`,
  );
}

/**
 * Handle orders/paid webhook
 */
export async function handleOrderPaid(shop: string, order: any): Promise<void> {
  const store = await db.store.findFirst({
    where: {
      domain: shop,
      platform: "shopify",
    },
  });

  if (!store) {
    console.error(`[Shopify] Store not found: ${shop}`);
    return;
  }

  // Update the order status
  await db.attribution.updateMany({
    where: {
      storeId: store.id,
      orderId: order.id.toString(),
    },
    data: {
      status: "paid",
      updatedAt: new Date(),
    },
  });

  console.log(`[Shopify] Order ${order.id} from ${shop} marked as paid`);
}

/**
 * Handle orders/fulfilled webhook
 */
export async function handleOrderFulfilled(
  shop: string,
  order: any,
): Promise<void> {
  const store = await db.store.findFirst({
    where: {
      domain: shop,
      platform: "shopify",
    },
  });

  if (!store) return;

  await db.attribution.updateMany({
    where: {
      storeId: store.id,
      orderId: order.id.toString(),
    },
    data: {
      status: "fulfilled",
      updatedAt: new Date(),
    },
  });
}

/**
 * Handle orders/cancelled webhook
 */
export async function handleOrderCancelled(
  shop: string,
  order: any,
): Promise<void> {
  const store = await db.store.findFirst({
    where: {
      domain: shop,
      platform: "shopify",
    },
  });

  if (!store) return;

  await db.attribution.updateMany({
    where: {
      storeId: store.id,
      orderId: order.id.toString(),
    },
    data: {
      status: "cancelled",
      updatedAt: new Date(),
    },
  });
}

/**
 * Handle app/uninstalled webhook
 */
export async function handleAppUninstalled(shop: string): Promise<void> {
  await db.store.updateMany({
    where: {
      domain: shop,
      platform: "shopify",
    },
    data: {
      status: "disconnected",
      accessToken: null,
      updatedAt: new Date(),
    },
  });

  console.log(`[Shopify] App uninstalled from ${shop}`);
}

/**
 * Generate a visitor ID from order data
 */
function generateVisitorId(order: any): string {
  const components = [
    order.client_details?.browser_ip || "",
    order.client_details?.user_agent || "",
    order.customer?.id?.toString() || "",
  ].filter(Boolean);

  if (components.length === 0) {
    return `shopify-${order.id}`;
  }

  return crypto
    .createHash("sha256")
    .update(components.join("-"))
    .digest("hex")
    .substring(0, 32);
}

/**
 * Hash IP for privacy
 */
function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

/**
 * Dispatch conversions to ad platforms
 */
async function dispatchConversions(
  storeId: string,
  order: any,
  attribution: any,
): Promise<void> {
  const store = await db.store.findUnique({
    where: { id: storeId },
    include: {
      integrations: true,
    },
  });

  if (!store?.integrations) return;

  const conversions = [];

  for (const integration of store.integrations) {
    if (!integration.enabled) continue;

    try {
      switch (integration.platform) {
        case "meta":
          if (attribution.fbclid) {
            await sendMetaConversion(integration, order, attribution);
            conversions.push({ platform: "meta", status: "sent" });
          }
          break;

        case "google":
          if (attribution.gclid) {
            await sendGoogleConversion(integration, order, attribution);
            conversions.push({ platform: "google", status: "sent" });
          }
          break;

        case "tiktok":
          if (attribution.ttclid) {
            await sendTikTokConversion(integration, order, attribution);
            conversions.push({ platform: "tiktok", status: "sent" });
          }
          break;
      }
    } catch (error) {
      console.error(
        `[Shopify] Failed to send ${integration.platform} conversion:`,
        error,
      );
      conversions.push({
        platform: integration.platform,
        status: "failed",
        error: (error as Error).message,
      });
    }
  }

  // Log the conversion dispatches
  await db.conversionLog.create({
    data: {
      storeId,
      orderId: order.id.toString(),
      dispatches: JSON.stringify(conversions),
      createdAt: new Date(),
    },
  });
}

/**
 * Send Meta CAPI conversion
 */
async function sendMetaConversion(
  integration: any,
  order: any,
  attribution: any,
): Promise<void> {
  const pixelId = integration.settings?.pixelId;
  const accessToken = integration.settings?.accessToken;

  if (!pixelId || !accessToken) return;

  const eventData = {
    event_name: "Purchase",
    event_time: Math.floor(new Date(order.created_at).getTime() / 1000),
    event_id: `shopify-${order.id}`,
    event_source_url: attribution.landing_page || undefined,
    action_source: "website",
    user_data: {
      em: order.email
        ? crypto
            .createHash("sha256")
            .update(order.email.toLowerCase())
            .digest("hex")
        : undefined,
      fbc: attribution.fbclid
        ? `fb.1.${Date.now()}.${attribution.fbclid}`
        : undefined,
      client_ip_address: order.client_details?.browser_ip || undefined,
      client_user_agent: order.client_details?.user_agent || undefined,
    },
    custom_data: {
      currency: order.currency,
      value: parseFloat(order.total_price),
      content_ids: order.line_items.map(
        (item: any) =>
          item.sku || item.product_id?.toString() || item.id.toString(),
      ),
      contents: order.line_items.map((item: any) => ({
        id: item.sku || item.product_id?.toString() || item.id.toString(),
        quantity: item.quantity,
        item_price: parseFloat(item.price),
      })),
      num_items: order.line_items.reduce(
        (sum: number, item: any) => sum + item.quantity,
        0,
      ),
    },
  };

  const response = await fetch(
    `https://graph.facebook.com/v18.0/${pixelId}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: [eventData],
        access_token: accessToken,
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Meta CAPI error: ${error}`);
  }
}

/**
 * Send Google Ads conversion
 */
async function sendGoogleConversion(
  integration: any,
  order: any,
  attribution: any,
): Promise<void> {
  const measurementId = integration.settings?.measurementId;
  const apiSecret = integration.settings?.apiSecret;

  if (!measurementId || !apiSecret) return;

  const eventData = {
    client_id: attribution.visitor_id,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: order.id.toString(),
          value: parseFloat(order.total_price),
          currency: order.currency,
          items: order.line_items.map((item: any) => ({
            item_id: item.sku || item.product_id?.toString(),
            item_name: item.title,
            quantity: item.quantity,
            price: parseFloat(item.price),
          })),
        },
      },
    ],
  };

  const response = await fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eventData),
    },
  );

  if (!response.ok) {
    throw new Error(`Google Analytics error: ${response.status}`);
  }
}

/**
 * Send TikTok Events API conversion
 */
async function sendTikTokConversion(
  integration: any,
  order: any,
  attribution: any,
): Promise<void> {
  const pixelCode = integration.settings?.pixelCode;
  const accessToken = integration.settings?.accessToken;

  if (!pixelCode || !accessToken) return;

  const eventData = {
    pixel_code: pixelCode,
    event: "CompletePayment",
    event_id: `shopify-${order.id}`,
    timestamp: new Date(order.created_at).toISOString(),
    context: {
      user: {
        email: order.email
          ? crypto
              .createHash("sha256")
              .update(order.email.toLowerCase())
              .digest("hex")
          : undefined,
        ttclid: attribution.ttclid || undefined,
      },
      page: {
        url: attribution.landing_page || undefined,
        referrer: attribution.referrer || undefined,
      },
      ip: order.client_details?.browser_ip || undefined,
      user_agent: order.client_details?.user_agent || undefined,
    },
    properties: {
      currency: order.currency,
      value: parseFloat(order.total_price),
      content_type: "product",
      contents: order.line_items.map((item: any) => ({
        content_id: item.sku || item.product_id?.toString(),
        content_name: item.title,
        quantity: item.quantity,
        price: parseFloat(item.price),
      })),
    },
  };

  const response = await fetch(
    "https://business-api.tiktok.com/open_api/v1.3/pixel/track/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
      body: JSON.stringify({
        pixel_code: pixelCode,
        data: [eventData],
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TikTok Events API error: ${error}`);
  }
}

/**
 * Webhook topic handlers map
 */
export const webhookHandlers: Record<
  string,
  (shop: string, body: any) => Promise<void>
> = {
  "orders/create": handleOrderCreated,
  "orders/paid": handleOrderPaid,
  "orders/fulfilled": handleOrderFulfilled,
  "orders/cancelled": handleOrderCancelled,
  "app/uninstalled": handleAppUninstalled,
};
