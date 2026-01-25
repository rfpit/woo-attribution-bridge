# WAB-D-006 Google Ads OAuth Connection

> **Status:** Draft
> **Author:** Claude
> **Created:** 2026-01-25
> **Updated:** 2026-01-25

## 1. Overview

### 1.1 Purpose
Enable users to connect their Google Ads accounts to the WAB Dashboard via OAuth 2.0, allowing the dashboard to pull ad spend data for ROAS calculation and campaign performance analysis.

### 1.2 Scope
**Covers:**
- Google OAuth 2.0 authorization flow for web applications
- Token exchange and secure storage
- Refresh token management
- Account selection for users with multiple Google Ads accounts
- Connection status management (connect/disconnect)

**Does NOT cover:**
- Server-side conversion sending (see WAB-P-005)
- Ad spend data sync/import (separate feature)
- Campaign management or modification

### 1.3 Dependencies
- NextAuth.js for session management
- Drizzle ORM for database operations
- Google Cloud Console project with OAuth credentials
- Google Ads API developer token
- `adPlatformConnections` table (existing)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Users can initiate Google Ads OAuth from the Ad Platforms page | Must |
| FR-002 | System redirects to Google consent screen with correct scopes | Must |
| FR-003 | System handles OAuth callback and exchanges code for tokens | Must |
| FR-004 | Access tokens and refresh tokens are stored securely | Must |
| FR-005 | System retrieves accessible Google Ads accounts after auth | Must |
| FR-006 | Users can select which Google Ads account to connect | Should |
| FR-007 | Connection is created in `adPlatformConnections` table | Must |
| FR-008 | Users can disconnect their Google Ads account | Must |
| FR-009 | System refreshes expired access tokens automatically | Must |
| FR-010 | Errors during OAuth flow show user-friendly messages | Must |
| FR-011 | State parameter prevents CSRF attacks | Must |
| FR-012 | Users cannot connect same Google Ads account twice | Should |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | OAuth callback response time | < 3 seconds |
| NFR-002 | Tokens encrypted at rest | AES-256 |
| NFR-003 | State token expiry | 10 minutes |
| NFR-004 | Token refresh before expiry | 5 minutes buffer |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Dashboard UI   │────▶│  API Routes     │────▶│  Google OAuth   │
│  (platforms)    │     │  (Next.js)      │     │  Server         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │                       ▼                       │
        │               ┌─────────────────┐             │
        │               │  PostgreSQL     │◀────────────┘
        │               │  (tokens)       │
        │               └─────────────────┘
        │                       │
        │                       ▼
        │               ┌─────────────────┐
        └──────────────▶│  Google Ads API │
                        │  (account list) │
                        └─────────────────┘
```

### 3.2 OAuth Flow Sequence

```
User clicks "Connect Google Ads"
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Generate state token, store in session                       │
│ 2. Redirect to Google OAuth:                                    │
│    https://accounts.google.com/o/oauth2/v2/auth                 │
│    ?client_id=xxx                                               │
│    &redirect_uri=https://dashboard/api/auth/google-ads/callback │
│    &response_type=code                                          │
│    &scope=https://www.googleapis.com/auth/adwords               │
│    &access_type=offline                                         │
│    &prompt=consent                                               │
│    &state=xxx                                                   │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼ (User consents on Google)
        │
┌─────────────────────────────────────────────────────────────────┐
│ 3. Google redirects to callback with ?code=xxx&state=xxx        │
│ 4. Verify state matches session                                 │
│ 5. Exchange code for tokens:                                    │
│    POST https://oauth2.googleapis.com/token                     │
│    {code, client_id, client_secret, redirect_uri, grant_type}   │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Fetch accessible Google Ads accounts:                        │
│    GET /customers:listAccessibleCustomers                       │
│ 7. If multiple accounts, redirect to selection page             │
│ 8. Store connection in database                                 │
│ 9. Redirect to platforms page with success message              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Data Structures

```typescript
// Environment variables required
interface GoogleAdsEnv {
  GOOGLE_ADS_CLIENT_ID: string;
  GOOGLE_ADS_CLIENT_SECRET: string;
  GOOGLE_ADS_DEVELOPER_TOKEN: string;
  GOOGLE_ADS_REDIRECT_URI: string;
}

// OAuth state stored in session/cookie
interface OAuthState {
  state: string;        // Random string for CSRF protection
  userId: string;       // Logged-in user ID
  expiresAt: number;    // Unix timestamp
}

// Token response from Google
interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;  // Only on first auth with prompt=consent
  expires_in: number;      // Seconds until expiry
  token_type: "Bearer";
  scope: string;
}

// Google Ads accessible customers response
interface AccessibleCustomersResponse {
  resourceNames: string[];  // Format: "customers/1234567890"
}

// Customer details
interface GoogleAdsCustomer {
  customerId: string;
  descriptiveName: string;
  currencyCode: string;
  timeZone: string;
}

// Connection record (extends existing schema)
interface GoogleAdsConnection {
  id: string;
  userId: string;
  platform: "google";
  accountId: string;           // Google Ads customer ID
  accountName: string | null;  // Descriptive name
  accessToken: string;         // Encrypted
  refreshToken: string;        // Encrypted
  tokenExpiresAt: Date;
  status: "active" | "expired" | "disconnected";
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.4 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/google-ads` | Initiate OAuth flow |
| GET | `/api/auth/google-ads/callback` | Handle OAuth callback |
| POST | `/api/auth/google-ads/select-account` | Select account (if multiple) |
| POST | `/api/auth/google-ads/refresh` | Manually refresh token |
| DELETE | `/api/platforms/[id]` | Disconnect (existing) |

---

## 4. Public Interface

### 4.1 Methods

#### `GET /api/auth/google-ads`

**Description:** Initiates the Google Ads OAuth flow by redirecting to Google's consent screen.

**Authentication:** Required (NextAuth session)

**Query Parameters:** None

**Behavior:**
1. Verify user is authenticated
2. Generate cryptographically random state token
3. Store state in encrypted cookie (10-minute expiry)
4. Redirect to Google OAuth authorization URL

**Returns:** 302 Redirect to Google OAuth

**Errors:**
- 401: Unauthorized (no session)

---

#### `GET /api/auth/google-ads/callback`

**Description:** Handles the OAuth callback from Google, exchanges code for tokens, and creates the connection.

**Authentication:** Required (NextAuth session)

**Query Parameters:**
- `code` (string): Authorization code from Google
- `state` (string): State token for CSRF verification
- `error` (string, optional): Error code if user denied access

**Behavior:**
1. Verify state matches stored value
2. If error, redirect to platforms page with error message
3. Exchange code for access + refresh tokens
4. Fetch accessible Google Ads accounts
5. If single account: create connection and redirect
6. If multiple accounts: redirect to account selection page

**Returns:** 302 Redirect to `/dashboard/platforms` or `/dashboard/platforms/google-ads/select`

**Errors:**
- 400: Invalid state (CSRF protection)
- 400: Missing authorization code
- 401: Unauthorized
- 500: Token exchange failed

---

#### `POST /api/auth/google-ads/select-account`

**Description:** Completes connection after user selects which Google Ads account to connect.

**Authentication:** Required (NextAuth session)

**Request Body:**
```json
{
  "customerId": "1234567890"
}
```

**Behavior:**
1. Verify tokens exist in temporary storage
2. Fetch account details for selected customer ID
3. Create connection in `adPlatformConnections`
4. Clear temporary token storage

**Returns:**
```json
{
  "success": true,
  "connection": {
    "id": "uuid",
    "platform": "google",
    "accountId": "1234567890",
    "accountName": "My Google Ads Account",
    "status": "active"
  }
}
```

**Errors:**
- 400: Invalid customer ID
- 401: Unauthorized
- 404: No pending tokens found
- 409: Account already connected

---

#### `POST /api/auth/google-ads/refresh`

**Description:** Refreshes an expired access token using the refresh token.

**Authentication:** Required (NextAuth session)

**Request Body:**
```json
{
  "connectionId": "uuid"
}
```

**Behavior:**
1. Verify user owns the connection
2. Call Google OAuth token endpoint with refresh_token grant
3. Update access token and expiry in database

**Returns:**
```json
{
  "success": true,
  "expiresAt": "2026-01-25T13:00:00Z"
}
```

**Errors:**
- 401: Unauthorized
- 404: Connection not found
- 400: Refresh token invalid/expired (requires re-auth)

---

## 5. Error Handling

### 5.1 Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| GOOGLE_AUTH_DENIED | User denied access | User clicked "Deny" on consent | Inform user, allow retry |
| GOOGLE_INVALID_STATE | Invalid state parameter | CSRF attack or expired state | Restart OAuth flow |
| GOOGLE_TOKEN_EXCHANGE_FAILED | Failed to exchange code | Invalid code or server error | Restart OAuth flow |
| GOOGLE_REFRESH_FAILED | Failed to refresh token | Refresh token revoked | Re-authenticate |
| GOOGLE_ACCOUNT_ALREADY_CONNECTED | Account already connected | Duplicate connection | Show existing connection |
| GOOGLE_NO_ADS_ACCOUNTS | No Google Ads accounts found | User has no Ads access | Inform user to set up Ads |

### 5.2 Logging

- **Level:** Info for successful auth, Error for failures
- **Format:** `[GoogleAds OAuth] [User ID] [Action] [Details]`
- **Sensitive data:** Never log tokens, only connection IDs

---

## 6. Security Considerations

- **Token Encryption:** Access and refresh tokens encrypted with AES-256-GCM before storage
- **State Parameter:** Cryptographically random, single-use, 10-minute expiry
- **HTTPS Only:** All OAuth redirects and callbacks over HTTPS
- **Refresh Token Rotation:** Google may rotate refresh tokens; always store newest
- **Scope Minimization:** Only request `adwords` scope (read-only by default)
- **Token Expiry:** Access tokens expire in 1 hour; refresh proactively
- **Revocation:** On disconnect, revoke tokens via Google API
- **Developer Token:** Store in environment variables, never in database

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_initiate_redirects_to_google | Start OAuth flow | 302 redirect with correct URL |
| test_initiate_requires_auth | No session | 401 Unauthorized |
| test_initiate_generates_state | State parameter | Valid random string stored |
| test_callback_validates_state | Mismatched state | 400 Invalid state |
| test_callback_handles_user_denial | User denies access | Redirect with error message |
| test_callback_exchanges_code | Valid code | Tokens received and stored |
| test_callback_fetches_accounts | After token exchange | Accounts list retrieved |
| test_callback_single_account | One account | Connection created directly |
| test_callback_multiple_accounts | Multiple accounts | Redirect to selection page |
| test_select_account_creates_connection | Valid selection | Connection in database |
| test_select_account_prevents_duplicate | Already connected | 409 Conflict |
| test_refresh_updates_token | Valid refresh token | New access token stored |
| test_refresh_invalid_token | Revoked refresh token | 400 error, status updated |
| test_token_encryption | Store and retrieve | Tokens decrypted correctly |

### 7.2 Integration Tests

- Complete OAuth flow with mocked Google responses
- Token refresh with expired access token
- Multi-account selection flow
- Disconnect and reconnect same account

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `dashboard/src/app/api/auth/google-ads/route.ts`
  - `dashboard/src/app/api/auth/google-ads/callback/route.ts`
  - `dashboard/src/app/api/auth/google-ads/select-account/route.ts`
  - `dashboard/src/app/api/auth/google-ads/refresh/route.ts`
  - `dashboard/src/lib/google-ads.ts`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `dashboard/src/app/api/auth/google-ads/route.ts` | Initiate OAuth |
| `dashboard/src/app/api/auth/google-ads/callback/route.ts` | Handle callback |
| `dashboard/src/app/api/auth/google-ads/select-account/route.ts` | Account selection |
| `dashboard/src/app/api/auth/google-ads/refresh/route.ts` | Token refresh |
| `dashboard/src/lib/google-ads.ts` | Google Ads API helpers |
| `dashboard/src/lib/encryption.ts` | Token encryption utilities |
| `dashboard/src/app/dashboard/platforms/google-ads/select/page.tsx` | Account selection UI |

### 8.2 Environment Variables

```env
# Google OAuth (from Google Cloud Console)
GOOGLE_ADS_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_ADS_CLIENT_SECRET=xxx
GOOGLE_ADS_REDIRECT_URI=https://dashboard.example.com/api/auth/google-ads/callback

# Google Ads API (from Google Ads API Center)
GOOGLE_ADS_DEVELOPER_TOKEN=xxx

# Token encryption
TOKEN_ENCRYPTION_KEY=32-byte-hex-string
```

### 8.3 Google Cloud Console Setup

1. Create project in Google Cloud Console
2. Enable Google Ads API
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URI
5. Configure OAuth consent screen
6. Apply for Google Ads API access (developer token)

### 8.4 Known Limitations

- Google limits refresh tokens to 100 per user per OAuth client
- Refresh tokens expire if unused for 6 months
- Developer token required (approval process can take time)
- Manager accounts require `login-customer-id` header for API calls

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-25 | Initial spec |
