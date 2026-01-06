/**
 * Marketplace OAuth Authentication Route
 *
 * Initiates OAuth flow for Amazon, eBay, or Etsy
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import crypto from "crypto";
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
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { platform } = await params;

    // Validate platform
    if (!VALID_PLATFORMS.includes(platform as Platform)) {
      return NextResponse.json(
        { error: `Invalid platform: ${platform}` },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
    const marketplace = searchParams.get("marketplace") || "US";

    // Generate state for CSRF protection (includes platform and marketplace info)
    const stateData = {
      nonce: crypto.randomBytes(16).toString("hex"),
      platform,
      marketplace,
      userId: session.user.id,
    };
    const state = Buffer.from(JSON.stringify(stateData)).toString("base64url");

    // For PKCE (Etsy)
    const codeVerifier = crypto.randomBytes(32).toString("base64url");

    // Get the appropriate connector and auth URL
    let authUrl: string;

    switch (platform as Platform) {
      case "amazon": {
        const connector = createAmazonConnector(marketplace);
        authUrl = connector.getAuthUrl(state);
        break;
      }
      case "ebay": {
        const connector = createEbayConnector(marketplace);
        authUrl = connector.getAuthUrl(state);
        break;
      }
      case "etsy": {
        const connector = createEtsyConnector();
        // Etsy uses PKCE, state is used as code verifier
        authUrl = connector.getAuthUrl(codeVerifier);
        break;
      }
      default:
        return NextResponse.json(
          { error: "Unknown platform" },
          { status: 400 },
        );
    }

    // Create response with redirect
    const response = NextResponse.redirect(authUrl);

    // Store state in cookie for verification
    response.cookies.set(`${platform}_oauth_state`, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 15, // 15 minutes
    });

    // Store PKCE verifier for Etsy
    if (platform === "etsy") {
      response.cookies.set("etsy_code_verifier", codeVerifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 15,
      });
    }

    return response;
  } catch (error) {
    console.error("Marketplace auth error:", error);
    return NextResponse.json(
      { error: "Failed to initiate authentication" },
      { status: 500 },
    );
  }
}
