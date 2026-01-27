/**
 * Meta Ads OAuth Callback Route
 *
 * Handles the OAuth callback from Facebook:
 * 1. Validates the state parameter
 * 2. Exchanges the authorization code for short-lived token
 * 3. Exchanges short-lived token for long-lived token (60 days)
 * 4. Fetches accessible Meta ad accounts
 * 5. Either creates connection (single account) or redirects to selection (multiple)
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adPlatformConnections, pendingOAuthTokens } from "@/db/schema";
import {
  exchangeCodeForTokens,
  exchangeForLongLivedToken,
  fetchAdAccounts,
  calculateTokenExpiry,
} from "@/lib/meta";
import { encrypt, decryptJson } from "@/lib/encryption";

const STATE_COOKIE_NAME = "meta_oauth_state";
const PENDING_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get the base URL for redirects.
 * Prefers NEXTAUTH_URL env var over request origin (which may be internal container URL).
 */
function getBaseUrl(request: NextRequest): string {
  return process.env.NEXTAUTH_URL || request.nextUrl.origin;
}

interface OAuthState {
  state: string;
  userId: string;
  expiresAt: number;
}

/**
 * GET /api/auth/meta/callback
 *
 * OAuth callback handler
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;

  // Check for OAuth error response from Facebook
  const error = searchParams.get("error");
  if (error) {
    const errorDescription =
      searchParams.get("error_description") || "OAuth authorization failed";
    const redirectUrl = new URL("/dashboard/platforms", getBaseUrl(request));
    redirectUrl.searchParams.set("error", errorDescription);
    return NextResponse.redirect(redirectUrl);
  }

  // Validate required parameters
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    return NextResponse.json(
      { error: "Authorization code is required" },
      { status: 400 },
    );
  }

  if (!state) {
    return NextResponse.json(
      { error: "State parameter is required" },
      { status: 400 },
    );
  }

  // Validate state from cookie
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(STATE_COOKIE_NAME);

  if (!stateCookie?.value) {
    return NextResponse.json(
      { error: "Invalid state: no state cookie found" },
      { status: 400 },
    );
  }

  let storedState: OAuthState;
  try {
    storedState = decryptJson<OAuthState>(stateCookie.value);
  } catch {
    return NextResponse.json(
      { error: "Invalid state: cookie decryption failed" },
      { status: 400 },
    );
  }

  if (storedState.state !== state) {
    return NextResponse.json(
      { error: "Invalid state: state mismatch" },
      { status: 400 },
    );
  }

  if (storedState.expiresAt < Date.now()) {
    return NextResponse.json(
      { error: "State has expired. Please try again." },
      { status: 400 },
    );
  }

  if (storedState.userId !== session.user.id) {
    return NextResponse.json(
      { error: "Invalid state: user mismatch" },
      { status: 400 },
    );
  }

  // Clear the state cookie
  cookieStore.delete(STATE_COOKIE_NAME);

  try {
    // Exchange code for short-lived token
    const shortLivedTokens = await exchangeCodeForTokens(code);

    // Exchange short-lived token for long-lived token (60 days)
    const longLivedTokens = await exchangeForLongLivedToken(
      shortLivedTokens.accessToken,
    );

    // Fetch accessible ad accounts
    const accounts = await fetchAdAccounts(longLivedTokens.accessToken);

    if (accounts.length === 0) {
      const redirectUrl = new URL("/dashboard/platforms", getBaseUrl(request));
      redirectUrl.searchParams.set(
        "error",
        "No Meta ad accounts found. Please create an ad account first.",
      );
      return NextResponse.redirect(redirectUrl);
    }

    if (accounts.length === 1) {
      // Single account - create connection directly
      const account = accounts[0];
      await db.insert(adPlatformConnections).values({
        userId: session.user.id,
        platform: "meta_ads",
        accountId: account.accountId,
        accountName: account.name,
        accessToken: encrypt(longLivedTokens.accessToken),
        refreshToken: null, // Meta doesn't use refresh tokens
        tokenExpiresAt: calculateTokenExpiry(longLivedTokens.expiresIn),
        status: "active",
      });

      const redirectUrl = new URL("/dashboard/platforms", getBaseUrl(request));
      redirectUrl.searchParams.set("success", "true");
      redirectUrl.searchParams.set("platform", "meta_ads");
      return NextResponse.redirect(redirectUrl);
    }

    // Multiple accounts - store pending token and redirect to selection
    const [pendingToken] = await db
      .insert(pendingOAuthTokens)
      .values({
        userId: session.user.id,
        platform: "meta_ads",
        accessToken: encrypt(longLivedTokens.accessToken),
        refreshToken: null, // Meta doesn't use refresh tokens
        tokenExpiresAt: calculateTokenExpiry(longLivedTokens.expiresIn),
        accounts: accounts,
        expiresAt: new Date(Date.now() + PENDING_TOKEN_EXPIRY_MS),
      })
      .returning({ id: pendingOAuthTokens.id });

    const redirectUrl = new URL(
      "/dashboard/platforms/meta/select",
      getBaseUrl(request),
    );
    redirectUrl.searchParams.set("pendingTokenId", pendingToken.id);
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Meta OAuth callback error:", err);
    const redirectUrl = new URL("/dashboard/platforms", getBaseUrl(request));
    redirectUrl.searchParams.set(
      "error",
      err instanceof Error ? err.message : "Failed to connect Meta Ads",
    );
    return NextResponse.redirect(redirectUrl);
  }
}
