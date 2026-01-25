/**
 * Meta Graph API helpers for OAuth and Ad Account access
 *
 * This module provides utilities for:
 * - Building Facebook OAuth authorization URLs
 * - Exchanging authorization codes for tokens
 * - Exchanging short-lived tokens for long-lived tokens (60 days)
 * - Generating app secret proofs for API calls
 * - Fetching user's ad accounts
 * - Refreshing tokens before expiry
 * - Revoking tokens on disconnect
 */

import * as crypto from "crypto";

// Graph API version - update periodically as Meta deprecates old versions
export const GRAPH_API_VERSION = "v18.0";

// OAuth and API endpoints
const FACEBOOK_OAUTH_URL = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Required scopes for ad account access
const OAUTH_SCOPES = ["ads_read", "ads_management", "business_management"];

// Types
export interface MetaConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
}

export interface MetaAdAccount {
  accountId: string;
  name: string | null;
  currency: string;
  timezone: string;
}

/**
 * Get Meta configuration from environment variables
 * @throws Error if required environment variables are missing
 */
export function getConfig(): MetaConfig {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;

  if (!appId) {
    throw new Error("META_APP_ID environment variable is required");
  }
  if (!appSecret) {
    throw new Error("META_APP_SECRET environment variable is required");
  }
  if (!redirectUri) {
    throw new Error("META_REDIRECT_URI environment variable is required");
  }

  return { appId, appSecret, redirectUri };
}

/**
 * Build the Facebook OAuth authorization URL
 * @param state - Random state token for CSRF protection
 * @returns Full OAuth URL to redirect user to
 */
export function buildAuthUrl(state: string): string {
  const config = getConfig();

  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: OAUTH_SCOPES.join(","),
    state: state,
  });

  // URLSearchParams encodes spaces as '+', but we need '%20' for consistency
  return `${FACEBOOK_OAUTH_URL}?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * Exchange authorization code for short-lived access token
 * @param code - Authorization code from OAuth callback
 * @returns Token response with access token and expiry
 * @throws Error if token exchange fails
 */
export async function exchangeCodeForTokens(
  code: string,
): Promise<TokenResponse> {
  const config = getConfig();

  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code: code,
  });

  const response = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Token exchange failed: ${error.error?.message || "Unknown error"}`,
    );
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Exchange short-lived token for long-lived token (60 days)
 * @param shortLivedToken - Short-lived access token (~1 hour)
 * @returns Token response with long-lived token
 * @throws Error if exchange fails
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<TokenResponse> {
  const config = getConfig();

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const response = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Failed to exchange for long-lived token: ${error.error?.message || "Unknown error"}`,
    );
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Generate app secret proof for API calls
 * Meta requires this HMAC-SHA256 hash for secure API calls
 * @param accessToken - The access token to generate proof for
 * @returns Hex-encoded HMAC-SHA256 hash
 */
export function generateAppSecretProof(accessToken: string): string {
  const config = getConfig();
  return crypto
    .createHmac("sha256", config.appSecret)
    .update(accessToken)
    .digest("hex");
}

/**
 * Fetch user's ad accounts from Graph API
 * @param accessToken - Valid access token with ads_read scope
 * @returns Array of ad accounts (filtered to active only)
 * @throws Error if API call fails
 */
export async function fetchAdAccounts(
  accessToken: string,
): Promise<MetaAdAccount[]> {
  const allAccounts: MetaAdAccount[] = [];
  let nextUrl: string | null = null;

  // Build initial URL with all required parameters
  const proof = generateAppSecretProof(accessToken);
  const params = new URLSearchParams({
    access_token: accessToken,
    appsecret_proof: proof,
    fields: "id,name,account_id,currency,timezone_name,account_status",
  });

  let url = `${GRAPH_API_BASE}/me/adaccounts?${params.toString()}`;

  // Paginate through all accounts
  do {
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        `Failed to fetch ad accounts: ${error.error?.message || "Unknown error"}`,
      );
    }

    const data = await response.json();

    // Process accounts from this page
    for (const account of data.data || []) {
      // Only include active accounts (account_status = 1)
      if (account.account_status === 1) {
        allAccounts.push({
          accountId: account.account_id,
          name: account.name || null,
          currency: account.currency,
          timezone: account.timezone_name,
        });
      }
    }

    // Check for next page
    nextUrl = data.paging?.next || null;
    if (nextUrl) {
      // Add appsecret_proof to next URL
      const nextUrlObj = new URL(nextUrl);
      nextUrlObj.searchParams.set("appsecret_proof", proof);
      url = nextUrlObj.toString();
    }
  } while (nextUrl);

  return allAccounts;
}

/**
 * Refresh a long-lived token by exchanging it for a new one
 * Note: Meta tokens can only be refreshed if not expired
 * @param currentToken - Current long-lived token
 * @returns New token response with extended expiry
 * @throws Error if token has expired or refresh fails
 */
export async function refreshToken(
  currentToken: string,
): Promise<TokenResponse> {
  const config = getConfig();

  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: currentToken,
  });

  const response = await fetch(
    `${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Token refresh failed: ${error.error?.message || "Unknown error"}`,
    );
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Revoke an access token
 * Invalidates all permissions granted to the app
 * @param accessToken - Token to revoke
 */
export async function revokeToken(accessToken: string): Promise<void> {
  try {
    const params = new URLSearchParams({
      access_token: accessToken,
    });

    await fetch(`${GRAPH_API_BASE}/me/permissions?${params.toString()}`, {
      method: "DELETE",
    });
    // Don't throw on failure - token may already be invalid
  } catch {
    // Silently ignore revocation errors
  }
}

/**
 * Calculate token expiry date from expires_in seconds
 * @param expiresIn - Number of seconds until token expires
 * @returns Date when token will expire
 */
export function calculateTokenExpiry(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}
