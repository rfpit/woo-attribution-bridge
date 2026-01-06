import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  exchangeCodeForToken,
  ShopifyClient,
  ShopifyConfig,
} from "@/lib/shopify/client";

const shopifyConfig: ShopifyConfig = {
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecret: process.env.SHOPIFY_API_SECRET || "",
  scopes: [],
  hostName: process.env.NEXT_PUBLIC_APP_URL || "",
};

const WEBHOOK_TOPICS = [
  "orders/create",
  "orders/paid",
  "orders/fulfilled",
  "orders/cancelled",
  "app/uninstalled",
];

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(
        `${shopifyConfig.hostName}/login?error=unauthorized`,
      );
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const shop = searchParams.get("shop");
    const hmac = searchParams.get("hmac");

    // Get stored state and shop from cookies
    const cookies = request.headers.get("cookie") || "";
    const storedState = getCookieValue(cookies, "shopify_oauth_state");
    const storedShop = getCookieValue(cookies, "shopify_oauth_shop");

    // Verify state
    if (!state || state !== storedState) {
      return NextResponse.redirect(
        `${shopifyConfig.hostName}/dashboard/stores?error=invalid_state`,
      );
    }

    // Verify shop matches
    if (!shop || shop !== storedShop) {
      return NextResponse.redirect(
        `${shopifyConfig.hostName}/dashboard/stores?error=shop_mismatch`,
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${shopifyConfig.hostName}/dashboard/stores?error=no_code`,
      );
    }

    // Exchange code for access token
    const tokenData = await exchangeCodeForToken(shop, code, shopifyConfig);

    // Get shop information
    const client = new ShopifyClient(shop, tokenData.accessToken);
    const shopInfo = await client.getShop();

    // Check if store already exists
    const existingStore = await db.store.findFirst({
      where: {
        domain: shop,
        userId: session.user.id,
      },
    });

    let storeId: string;

    if (existingStore) {
      // Update existing store
      await db.store.update({
        where: { id: existingStore.id },
        data: {
          accessToken: tokenData.accessToken,
          status: "connected",
          name: shopInfo.name,
          currency: shopInfo.currency,
          timezone: shopInfo.timezone,
          updatedAt: new Date(),
        },
      });
      storeId = existingStore.id;
    } else {
      // Create new store
      const newStore = await db.store.create({
        data: {
          userId: session.user.id,
          platform: "shopify",
          domain: shop,
          url: `https://${shop}`,
          name: shopInfo.name,
          accessToken: tokenData.accessToken,
          status: "connected",
          currency: shopInfo.currency,
          timezone: shopInfo.timezone,
        },
      });
      storeId = newStore.id;
    }

    // Register webhooks
    await registerWebhooks(client, storeId);

    // Clear OAuth cookies
    const response = NextResponse.redirect(
      `${shopifyConfig.hostName}/dashboard/stores?success=connected`,
    );
    response.cookies.delete("shopify_oauth_state");
    response.cookies.delete("shopify_oauth_shop");

    return response;
  } catch (error) {
    console.error("Shopify callback error:", error);
    return NextResponse.redirect(
      `${shopifyConfig.hostName}/dashboard/stores?error=callback_failed`,
    );
  }
}

/**
 * Register webhooks for the store
 */
async function registerWebhooks(
  client: ShopifyClient,
  storeId: string,
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  const webhookUrl = `${baseUrl}/api/shopify/webhooks`;

  // Get existing webhooks
  const existingWebhooks = await client.listWebhooks();

  for (const topic of WEBHOOK_TOPICS) {
    // Check if webhook already exists
    const exists = existingWebhooks.some(
      (w) => w.topic === topic && w.address === webhookUrl,
    );

    if (!exists) {
      try {
        const webhook = await client.createWebhook(topic, webhookUrl);
        console.log(`[Shopify] Registered webhook: ${topic} -> ${webhook.id}`);
      } catch (error) {
        console.error(`[Shopify] Failed to register webhook ${topic}:`, error);
      }
    }
  }
}

/**
 * Parse cookie value from cookie header
 */
function getCookieValue(cookies: string, name: string): string | null {
  const match = cookies.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : null;
}
