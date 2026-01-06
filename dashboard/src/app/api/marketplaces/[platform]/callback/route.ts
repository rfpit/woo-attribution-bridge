/**
 * Marketplace OAuth Callback Route
 *
 * Handles OAuth callback from Amazon, eBay, or Etsy
 * Exchanges code for tokens and stores the connection
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { marketplaceConnections } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  createAmazonConnector,
  createEbayConnector,
  createEtsyConnector,
} from "@/lib/marketplaces";

type Platform = "amazon" | "ebay" | "etsy";

const VALID_PLATFORMS: Platform[] = ["amazon", "ebay", "etsy"];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ platform: string }> },
) {
  const cookieStore = await cookies();
  const { platform } = await params;

  try {
    // Validate platform
    if (!VALID_PLATFORMS.includes(platform as Platform)) {
      return redirectWithError(`Invalid platform: ${platform}`);
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    // Handle OAuth errors
    if (error) {
      console.error(`${platform} OAuth error:`, error, errorDescription);
      return redirectWithError(errorDescription || error);
    }

    if (!code) {
      return redirectWithError("Missing authorization code");
    }

    // Verify state
    const storedState = cookieStore.get(`${platform}_oauth_state`)?.value;
    if (!storedState || (state && storedState !== state)) {
      return redirectWithError("Invalid state parameter");
    }

    // Parse state to get user ID and marketplace
    let stateData: {
      nonce: string;
      platform: string;
      marketplace: string;
      userId: string;
    };

    try {
      stateData = JSON.parse(Buffer.from(storedState, "base64url").toString());
    } catch {
      return redirectWithError("Invalid state format");
    }

    const { userId, marketplace } = stateData;

    // Exchange code for tokens based on platform
    let accessToken: string;
    let refreshToken: string | undefined;
    let expiresIn: number;
    let sellerInfo: {
      sellerId: string;
      sellerName: string;
      marketplaces: string[];
    };

    switch (platform as Platform) {
      case "amazon": {
        const connector = createAmazonConnector(marketplace);
        const tokens = await connector.exchangeCodeForTokens(code);
        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken;
        expiresIn = tokens.expiresIn;
        sellerInfo = await connector.getSellerInfo(accessToken);
        break;
      }
      case "ebay": {
        const connector = createEbayConnector(marketplace);
        const tokens = await connector.exchangeCodeForTokens(code);
        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken;
        expiresIn = tokens.expiresIn;
        sellerInfo = await connector.getSellerInfo(accessToken);
        break;
      }
      case "etsy": {
        const connector = createEtsyConnector();
        const codeVerifier = cookieStore.get("etsy_code_verifier")?.value;
        const tokens = await connector.exchangeCodeForTokens(
          code,
          codeVerifier,
        );
        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken;
        expiresIn = tokens.expiresIn;
        sellerInfo = await connector.getSellerInfo(accessToken);
        break;
      }
      default:
        return redirectWithError("Unknown platform");
    }

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Check if connection already exists
    const existing = await db
      .select()
      .from(marketplaceConnections)
      .where(
        and(
          eq(marketplaceConnections.userId, userId),
          eq(marketplaceConnections.platform, platform),
          eq(marketplaceConnections.sellerId, sellerInfo.sellerId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing connection
      await db
        .update(marketplaceConnections)
        .set({
          accessToken,
          refreshToken: refreshToken || existing[0].refreshToken,
          tokenExpiresAt,
          sellerName: sellerInfo.sellerName,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(marketplaceConnections.id, existing[0].id));
    } else {
      // Create new connection
      await db.insert(marketplaceConnections).values({
        userId,
        platform,
        sellerId: sellerInfo.sellerId,
        sellerName: sellerInfo.sellerName,
        marketplace,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        status: "active",
        settings: { marketplaces: sellerInfo.marketplaces },
      });
    }

    // Clear OAuth cookies
    const response = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/marketplaces?success=${platform}`,
    );
    response.cookies.delete(`${platform}_oauth_state`);
    if (platform === "etsy") {
      response.cookies.delete("etsy_code_verifier");
    }

    return response;
  } catch (error) {
    console.error(`${platform} OAuth callback error:`, error);
    return redirectWithError(
      error instanceof Error ? error.message : "Authentication failed",
    );
  }
}

function redirectWithError(error: string): NextResponse {
  const encodedError = encodeURIComponent(error);
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/marketplaces?error=${encodedError}`,
  );
}
