/**
 * Google Ads OAuth Callback Route
 *
 * Handles the OAuth callback from Google:
 * 1. Validates the state parameter
 * 2. Exchanges the authorization code for tokens
 * 3. Fetches accessible Google Ads accounts
 * 4. Either creates connection (single account) or redirects to selection (multiple)
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adPlatformConnections, pendingOAuthTokens } from "@/db/schema";
import {
  exchangeCodeForTokens,
  fetchAccessibleCustomers,
  fetchCustomerDetails,
  fetchMultipleCustomerDetails,
  calculateTokenExpiry,
  getConfig,
} from "@/lib/google-ads";
import { encrypt, decryptJson } from "@/lib/encryption";

const STATE_COOKIE_NAME = "google_ads_oauth_state";
const PENDING_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface OAuthState {
  state: string;
  userId: string;
  expiresAt: number;
}

/**
 * GET /api/auth/google-ads/callback
 *
 * OAuth callback handler
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;

  // Check for OAuth error response
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
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    const config = getConfig();

    let accounts;

    // If loginCustomerId is configured, use it directly (bypasses listAccessibleCustomers)
    // This is needed because the REST API endpoint may return 501 UNIMPLEMENTED
    // for some developer token configurations
    if (config.loginCustomerId) {
      console.log("Using configured loginCustomerId:", config.loginCustomerId);
      try {
        const account = await fetchCustomerDetails(
          tokens.accessToken,
          config.loginCustomerId,
          config.loginCustomerId,
        );
        accounts = [account];
      } catch (detailsErr) {
        console.error("Failed to fetch customer details:", detailsErr);
        throw new Error(
          `Failed to fetch account details for customer ${config.loginCustomerId}`,
        );
      }
    } else {
      // No loginCustomerId configured - try to list accessible customers
      const customerIds = await fetchAccessibleCustomers(tokens.accessToken);

      if (customerIds.length === 0) {
        const redirectUrl = new URL(
          "/dashboard/platforms",
          request.nextUrl.origin,
        );
        redirectUrl.searchParams.set(
          "error",
          "No Google Ads accounts found. Please create an account first.",
        );
        return NextResponse.redirect(redirectUrl);
      }

      // Fetch account details
      accounts = await fetchMultipleCustomerDetails(
        tokens.accessToken,
        customerIds,
      );
    }

    if (!accounts || accounts.length === 0) {
      const redirectUrl = new URL(
        "/dashboard/platforms",
        request.nextUrl.origin,
      );
      redirectUrl.searchParams.set(
        "error",
        "No Google Ads accounts found. Please check your configuration.",
      );
      return NextResponse.redirect(redirectUrl);
    }

    if (accounts.length === 1) {
      // Single account - create connection directly
      const account = accounts[0];
      await db.insert(adPlatformConnections).values({
        userId: session.user.id,
        platform: "google_ads",
        accountId: account.customerId,
        accountName: account.name,
        accessToken: encrypt(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
        tokenExpiresAt: calculateTokenExpiry(tokens.expiresIn),
        status: "active",
      });

      const redirectUrl = new URL(
        "/dashboard/platforms",
        request.nextUrl.origin,
      );
      redirectUrl.searchParams.set("success", "true");
      redirectUrl.searchParams.set("platform", "google_ads");
      return NextResponse.redirect(redirectUrl);
    }

    // Multiple accounts - store pending token and redirect to selection
    const [pendingToken] = await db
      .insert(pendingOAuthTokens)
      .values({
        userId: session.user.id,
        platform: "google_ads",
        accessToken: encrypt(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
        tokenExpiresAt: calculateTokenExpiry(tokens.expiresIn),
        accounts: accounts,
        expiresAt: new Date(Date.now() + PENDING_TOKEN_EXPIRY_MS),
      })
      .returning({ id: pendingOAuthTokens.id });

    const redirectUrl = new URL(
      "/dashboard/platforms/google-ads/select",
      request.nextUrl.origin,
    );
    redirectUrl.searchParams.set("pendingTokenId", pendingToken.id);
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("Google Ads OAuth callback error:", err);
    const redirectUrl = new URL("/dashboard/platforms", request.nextUrl.origin);
    redirectUrl.searchParams.set(
      "error",
      err instanceof Error ? err.message : "Failed to connect Google Ads",
    );
    return NextResponse.redirect(redirectUrl);
  }
}
