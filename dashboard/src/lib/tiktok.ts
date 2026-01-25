/**
 * TikTok Marketing API helpers
 *
 * Implements OAuth 2.0 flow for TikTok Ads integration.
 * Key differences from other platforms:
 * - 24-hour access token expiry (requires daily refresh)
 * - Refresh token rotation (new refresh token on each use)
 * - 1-year refresh token validity
 */

// TikTok Marketing API version
export const MARKETING_API_VERSION = "v1.3";

// Base URLs
const AUTH_BASE_URL = "https://ads.tiktok.com/marketing_api/auth";
const API_BASE_URL = `https://business-api.tiktok.com/open_api/${MARKETING_API_VERSION}`;

// TikTok API error codes
const ERROR_REFRESH_TOKEN_EXPIRED = 40104;

export interface TikTokConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
  advertiserIds: string[];
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  refreshTokenExpiresIn: number;
}

export interface AdvertiserInfo {
  advertiserId: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
  company: string;
}

/**
 * Get TikTok configuration from environment variables
 * @throws Error if required environment variables are missing
 */
export function getConfig(): TikTokConfig {
  const appId = process.env.TIKTOK_APP_ID;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;

  if (!appId) {
    throw new Error("TIKTOK_APP_ID environment variable is required");
  }

  if (!appSecret) {
    throw new Error("TIKTOK_APP_SECRET environment variable is required");
  }

  if (!redirectUri) {
    throw new Error("TIKTOK_REDIRECT_URI environment variable is required");
  }

  return {
    appId,
    appSecret,
    redirectUri,
  };
}

/**
 * Build the TikTok OAuth authorization URL
 * @param state - CSRF protection token
 * @returns The full authorization URL
 */
export function buildAuthUrl(state: string): string {
  const config = getConfig();

  // Build URL manually to ensure consistent encoding (%20 for spaces, not +)
  const params = [
    `app_id=${encodeURIComponent(config.appId)}`,
    `redirect_uri=${encodeURIComponent(config.redirectUri)}`,
    `state=${encodeURIComponent(state)}`,
  ].join("&");

  return `${AUTH_BASE_URL}?${params}`;
}

/**
 * Exchange authorization code for access and refresh tokens
 * @param code - The authorization code from the OAuth callback
 * @returns Token response with access token, refresh token, and advertiser IDs
 * @throws Error if token exchange fails
 */
export async function exchangeCodeForTokens(
  code: string,
): Promise<TokenResponse> {
  const config = getConfig();

  const response = await fetch(`${API_BASE_URL}/oauth2/access_token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: config.appId,
      secret: config.appSecret,
      auth_code: code,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Token exchange request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`Token exchange failed: ${data.message}`);
  }

  return {
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    accessTokenExpiresIn: data.data.access_token_expire_in,
    refreshTokenExpiresIn: data.data.refresh_token_expire_in,
    advertiserIds: data.data.advertiser_ids,
  };
}

/**
 * Refresh an access token using a refresh token
 * Note: TikTok rotates refresh tokens - the response contains a NEW refresh token
 * @param refreshToken - The current refresh token
 * @returns New access token and refresh token
 * @throws Error if refresh fails or refresh token is expired
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<RefreshTokenResponse> {
  const config = getConfig();

  const response = await fetch(`${API_BASE_URL}/oauth2/refresh_token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: config.appId,
      secret: config.appSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Token refresh request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  if (data.code !== 0) {
    // Special handling for expired refresh token
    if (data.code === ERROR_REFRESH_TOKEN_EXPIRED) {
      throw new Error("Refresh token expired");
    }
    throw new Error(`Token refresh failed: ${data.message}`);
  }

  return {
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    accessTokenExpiresIn: data.data.access_token_expire_in,
    refreshTokenExpiresIn: data.data.refresh_token_expire_in,
  };
}

/**
 * Fetch advertiser information for given advertiser IDs
 * @param accessToken - Valid access token
 * @param advertiserIds - Array of advertiser IDs to fetch
 * @returns Array of active advertiser info (disabled accounts filtered out)
 * @throws Error if API call fails
 */
export async function fetchAdvertiserInfo(
  accessToken: string,
  advertiserIds: string[],
): Promise<AdvertiserInfo[]> {
  const params = new URLSearchParams({
    advertiser_ids: JSON.stringify(advertiserIds),
  });

  const response = await fetch(
    `${API_BASE_URL}/advertiser/info/?${params.toString()}`,
    {
      method: "GET",
      headers: {
        "Access-Token": accessToken,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Advertiser info request failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`Advertiser info failed: ${data.message}`);
  }

  // Map and filter to only include active advertisers
  return data.data.list
    .filter(
      (advertiser: { status: string }) => advertiser.status === "STATUS_ENABLE",
    )
    .map(
      (advertiser: {
        advertiser_id: string;
        advertiser_name: string;
        currency: string;
        timezone: string;
        status: string;
        company: string;
      }) => ({
        advertiserId: advertiser.advertiser_id,
        name: advertiser.advertiser_name,
        currency: advertiser.currency,
        timezone: advertiser.timezone,
        status: advertiser.status,
        company: advertiser.company,
      }),
    );
}

/**
 * Revoke an access token
 * Note: This is a best-effort operation - does not throw on failure
 * (token may already be invalid/expired)
 * @param accessToken - The access token to revoke
 */
export async function revokeToken(accessToken: string): Promise<void> {
  const config = getConfig();

  try {
    await fetch(`${API_BASE_URL}/oauth2/revoke_token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_id: config.appId,
        secret: config.appSecret,
        access_token: accessToken,
      }),
    });
    // Silently succeed/fail - token may already be invalid
  } catch {
    // Ignore errors - token may already be revoked/expired
  }
}

/**
 * Calculate token expiry date from expires_in seconds
 * @param expiresIn - Number of seconds until expiry
 * @returns Date when the token expires
 */
export function calculateTokenExpiry(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}

/**
 * Check if an error code indicates the refresh token has expired
 * @param code - TikTok API error code
 * @returns True if the error indicates refresh token expiry
 */
export function isRefreshTokenExpiredError(code: number): boolean {
  return code === ERROR_REFRESH_TOKEN_EXPIRED;
}
