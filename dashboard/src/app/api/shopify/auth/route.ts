import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getShopifyAuthUrl, ShopifyConfig } from "@/lib/shopify/client";
import crypto from "crypto";

const shopifyConfig: ShopifyConfig = {
  apiKey: process.env.SHOPIFY_API_KEY || "",
  apiSecret: process.env.SHOPIFY_API_SECRET || "",
  scopes: [
    "read_orders",
    "write_orders",
    "read_customers",
    "read_products",
    "read_analytics",
    "write_pixels",
  ],
  hostName: process.env.NEXT_PUBLIC_APP_URL || "",
};

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const shop = searchParams.get("shop");

    if (!shop) {
      return NextResponse.json(
        { error: "Missing shop parameter" },
        { status: 400 },
      );
    }

    // Validate shop domain format
    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
    if (!shopRegex.test(shop)) {
      return NextResponse.json(
        { error: "Invalid shop domain format" },
        { status: 400 },
      );
    }

    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString("hex");

    // Store state in cookie for verification
    const redirectUri = `${shopifyConfig.hostName}/api/shopify/callback`;
    const authUrl = getShopifyAuthUrl(shop, shopifyConfig, state, redirectUri);

    // Create response with redirect and state cookie
    const response = NextResponse.redirect(authUrl);
    response.cookies.set("shopify_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10, // 10 minutes
    });
    response.cookies.set("shopify_oauth_shop", shop, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    console.error("Shopify auth error:", error);
    return NextResponse.json(
      { error: "Failed to initiate authentication" },
      { status: 500 },
    );
  }
}
