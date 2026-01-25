/**
 * TikTok Ads OAuth Callback Route
 *
 * Handles the OAuth callback from TikTok:
 * 1. Validates the state parameter
 * 2. Exchanges the authorization code for access and refresh tokens
 * 3. Fetches accessible TikTok advertiser accounts
 * 4. Either creates connection (single account) or redirects to selection (multiple)
 *
 * Key differences from Meta:
 * - Access tokens expire in 24 hours (vs 60 days)
 * - Uses refresh tokens (Meta doesn't)
 * - Stores both access token and refresh token expiry times
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adPlatformConnections, pendingOAuthTokens } from "@/db/schema";
import {
  exchangeCodeForTokens,
  fetchAdvertiserInfo,
  calculateTokenExpiry,
} from "@/lib/tiktok";
import { encrypt, decryptJson } from "@/lib/encryption";

const STATE_COOKIE_NAME = "tiktok_oauth_state";
const PENDING_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface OAuthState {
  state: string;
  userId: string;
  expiresAt: number;
}

/**
 * GET /api/auth/tiktok/callback
 *
 * OAuth callback handler
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    const redirectUrl = new URL("/dashboard/platforms", request.nextUrl.origin);
    redirectUrl.searchParams.set("error", "Unauthorized");
    return NextResponse.redirect(redirectUrl);
  }

  const searchParams = request.nextUrl.searchParams;

  // Check for OAuth error response from TikTok
  const error = searchParams.get("error");
  if (error) {
    const errorDescription =
      searchParams.get("error_description") || "OAuth authorization failed";
    const redirectUrl = new URL("/dashboard/platforms", request.nextUrl.origin);
    redirectUrl.searchParams.set("error", errorDescription);
    return NextResponse.redirect(redirectUrl);
  }

  // Validate required parameters
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    const redirectUrl = new URL("/dashboard/platforms", request.nextUrl.origin);
    redirectUrl.searchParams.set("error", "Authorization code is required");
    return NextResponse.redirect(redirectUrl);
  }

  if (!state) {
    const redirectUrl = new URL("/dashboard/platforms", request.nextUrl.origin);
    redirectUrl.searchParams.set("error", "State parameter is required");
    return NextResponse.redirect(redirectUrl);
  }

  // Validate state from cookie
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(STATE_COOKIE_NAME);

  if (!stateCookie?.value) {
    const redirectUrl = new URL("/dashboard/platforms", request.nextUrl.origin);
    redirectUrl.searchParams.set(
      "error",
      "Invalid state: no state cookie found",
    );
    return NextResponse.redirect(redirectUrl);
  }

  let storedState: OAuthState;
  try {
    storedState = decryptJson<OAuthState>(stateCookie.value);
  } catch {
    const redirectUrl = new URL("/dashboard/platforms", request.nextUrl.origin);
    redirectUrl.searchParams.set(
      "error",
      "Invalid state: cookie decryption failed",
    );
    return NextResponse.redirect(redirectUrl);
  }

  if (storedState.state !== state) {
    const redirectUrl = new URL("/dashboard/platforms", request.nextUrl.origin);
    redirectUrl.searchParams.set("error", "Invalid state: state mismatch");
    return NextResponse.redirect(redirectUrl);
  }

  if (storedState.expiresAt < Date.now()) {
    const redirectUrl = new URL("/dashboard/platforms", request.nextUrl.origin);
    redirectUrl.searchParams.set(
      "error",
      "State has expired. Please try again.",
    );
    return NextResponse.redirect(redirectUrl);
  }

  if (storedState.userId !== session.user.id) {
    const redirectUrl = new URL("/dashboard/platforms", request.nextUrl.origin);
    redirectUrl.searchParams.set("error", "Invalid state: user mismatch");
    return NextResponse.redirect(redirectUrl);
  }

  // Clear the state cookie
  cookieStore.delete(STATE_COOKIE_NAME);

  try {
    // Exchange code for tokens (TikTok returns both access and refresh tokens)
    const tokens = await exchangeCodeForTokens(code);

    // Fetch accessible advertiser accounts
    const advertisers = await fetchAdvertiserInfo(
      tokens.accessToken,
      tokens.advertiserIds,
    );

    if (advertisers.length === 0) {
      const redirectUrl = new URL(
        "/dashboard/platforms",
        request.nextUrl.origin,
      );
      redirectUrl.searchParams.set(
        "error",
        "No TikTok ad accounts found. Please create an ad account first.",
      );
      return NextResponse.redirect(redirectUrl);
    }

    // Map advertisers to account format for storage
    const accounts = advertisers.map((adv) => ({
      accountId: adv.advertiserId,
      name: adv.name,
      currency: adv.currency,
      timezone: adv.timezone,
    }));

    if (accounts.length === 1) {
      // Single account - create connection directly
      const account = accounts[0];
      await db.insert(adPlatformConnections).values({
        userId: session.user.id,
        platform: "tiktok_ads",
        accountId: account.accountId,
        accountName: account.name,
        accessToken: encrypt(tokens.accessToken),
        refreshToken: encrypt(tokens.refreshToken),
        tokenExpiresAt: calculateTokenExpiry(tokens.accessTokenExpiresIn),
        status: "active",
      });

      const redirectUrl = new URL(
        "/dashboard/platforms",
        request.nextUrl.origin,
      );
      redirectUrl.searchParams.set("success", "true");
      redirectUrl.searchParams.set("platform", "tiktok_ads");
      return NextResponse.redirect(redirectUrl);
    }

    // Multiple accounts - store pending token and redirect to selection
    const [pendingToken] = await db
      .insert(pendingOAuthTokens)
      .values({
        userId: session.user.id,
        platform: "tiktok_ads",
        accessToken: encrypt(tokens.accessToken),
        refreshToken: encrypt(tokens.refreshToken),
        tokenExpiresAt: calculateTokenExpiry(tokens.accessTokenExpiresIn),
        accounts: accounts,
        expiresAt: new Date(Date.now() + PENDING_TOKEN_EXPIRY_MS),
      })
      .returning({ id: pendingOAuthTokens.id });

    const redirectUrl = new URL(
      "/dashboard/platforms/tiktok/select",
      request.nextUrl.origin,
    );
    redirectUrl.searchParams.set("pendingTokenId", pendingToken.id);
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("TikTok OAuth callback error:", err);
    const redirectUrl = new URL("/dashboard/platforms", request.nextUrl.origin);
    redirectUrl.searchParams.set(
      "error",
      err instanceof Error ? err.message : "Failed to connect TikTok Ads",
    );
    return NextResponse.redirect(redirectUrl);
  }
}
