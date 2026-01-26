/**
 * Google Ads API Helpers
 *
 * Provides utilities for OAuth 2.0 authentication and API interactions
 * with the Google Ads API.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_ADS_API_URL = "https://googleads.googleapis.com/v18";

/**
 * Google Ads configuration from environment variables.
 */
export interface GoogleAdsConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  developerToken: string;
}

/**
 * Token response from OAuth token exchange.
 */
export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

/**
 * Customer details from Google Ads API.
 */
export interface CustomerDetails {
  customerId: string;
  name: string | null;
  currency: string;
  timezone: string;
}

/**
 * Get Google Ads configuration from environment variables.
 * Throws if required variables are missing.
 */
export function getConfig(): GoogleAdsConfig {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_ADS_REDIRECT_URI;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  if (!clientId) {
    throw new Error("GOOGLE_ADS_CLIENT_ID environment variable is not set");
  }
  if (!clientSecret) {
    throw new Error("GOOGLE_ADS_CLIENT_SECRET environment variable is not set");
  }
  if (!redirectUri) {
    throw new Error("GOOGLE_ADS_REDIRECT_URI environment variable is not set");
  }
  if (!developerToken) {
    throw new Error(
      "GOOGLE_ADS_DEVELOPER_TOKEN environment variable is not set",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    developerToken,
  };
}

/**
 * Build the OAuth authorization URL for Google Ads.
 *
 * @param state - Random state token for CSRF protection
 * @returns The authorization URL to redirect users to
 */
export function buildAuthUrl(state: string): string {
  const config = getConfig();

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/adwords",
    access_type: "offline",
    prompt: "consent",
    state: state,
  });

  // URLSearchParams encodes spaces as '+', but we need '%20' for consistency
  return `${GOOGLE_AUTH_URL}?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * Exchange an authorization code for access and refresh tokens.
 *
 * @param code - The authorization code from the OAuth callback
 * @returns Token response with access token, optional refresh token, and expiry
 */
export async function exchangeCodeForTokens(
  code: string,
): Promise<TokenResponse> {
  const config = getConfig();

  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Token exchange failed: ${error.error_description || error.error}`,
    );
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Refresh an access token using a refresh token.
 *
 * @param refreshToken - The refresh token from initial auth
 * @returns New access token and expiry
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<Omit<TokenResponse, "refreshToken">> {
  const config = getConfig();

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `Token refresh failed: ${error.error_description || error.error}`,
    );
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetch list of accessible Google Ads customer IDs.
 *
 * @param accessToken - Valid OAuth access token
 * @returns Array of customer IDs (without "customers/" prefix)
 */
export async function fetchAccessibleCustomers(
  accessToken: string,
): Promise<string[]> {
  const config = getConfig();

  const url = `${GOOGLE_ADS_API_URL}/customers:listAccessibleCustomers`;
  console.log("Fetching accessible customers from:", url);
  console.log(
    "Using developer token:",
    config.developerToken.substring(0, 8) + "...",
  );

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": config.developerToken,
    },
  });

  console.log("Response status:", response.status, response.statusText);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Google Ads API error:", JSON.stringify(errorData, null, 2));
    const errorMessage =
      errorData.error?.message || "Failed to fetch accessible customers";
    throw new Error(errorMessage);
  }

  const data = await response.json();
  const resourceNames: string[] = data.resourceNames || [];

  // Extract customer IDs from resource names (e.g., "customers/1234567890" -> "1234567890")
  return resourceNames.map((name: string) => name.replace("customers/", ""));
}

/**
 * Fetch details for a specific Google Ads customer.
 *
 * @param accessToken - Valid OAuth access token
 * @param customerId - The customer ID to fetch details for
 * @param loginCustomerId - Optional manager account ID for accessing sub-accounts
 * @returns Customer details including name, currency, and timezone
 */
export async function fetchCustomerDetails(
  accessToken: string,
  customerId: string,
  loginCustomerId?: string,
): Promise<CustomerDetails> {
  const config = getConfig();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": config.developerToken,
    "login-customer-id": loginCustomerId || customerId,
    "Content-Type": "application/json",
  };

  const query = `
    SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone
    FROM customer
    LIMIT 1
  `;

  const response = await fetch(
    `${GOOGLE_ADS_API_URL}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch customer details for ${customerId}`);
  }

  const data = await response.json();
  const customer = data[0]?.customer;

  if (!customer) {
    throw new Error(`No customer data returned for ${customerId}`);
  }

  return {
    customerId: customer.id,
    name: customer.descriptiveName || null,
    currency: customer.currencyCode,
    timezone: customer.timeZone,
  };
}

/**
 * Fetch details for multiple Google Ads customers.
 * Handles partial failures gracefully - returns only successful fetches.
 *
 * @param accessToken - Valid OAuth access token
 * @param customerIds - Array of customer IDs to fetch
 * @returns Array of customer details for successfully fetched customers
 */
export async function fetchMultipleCustomerDetails(
  accessToken: string,
  customerIds: string[],
): Promise<CustomerDetails[]> {
  const results = await Promise.allSettled(
    customerIds.map((id) => fetchCustomerDetails(accessToken, id)),
  );

  return results
    .filter(
      (result): result is PromiseFulfilledResult<CustomerDetails> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
}

/**
 * Revoke an OAuth token.
 * Does not throw on failure - token may already be invalid.
 *
 * @param token - The token to revoke (access or refresh token)
 */
export async function revokeToken(token: string): Promise<void> {
  await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `token=${token}`,
  });
  // Intentionally not checking response - token may already be revoked/invalid
}

/**
 * Calculate token expiry date from expires_in seconds.
 *
 * @param expiresIn - Number of seconds until token expires
 * @returns Date when the token will expire
 */
export function calculateTokenExpiry(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}
