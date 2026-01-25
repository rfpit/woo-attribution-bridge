# WAB-D-008 TikTok Ads OAuth Connection

> **Status:** Draft
> **Author:** Claude
> **Created:** 2026-01-25
> **Updated:** 2026-01-25

## 1. Overview

### 1.1 Purpose
Enable users to connect their TikTok Ads accounts to the WAB Dashboard via OAuth 2.0, allowing the dashboard to pull ad spend data for ROAS calculation and campaign performance analysis.

### 1.2 Scope
**Covers:**
- TikTok Marketing API OAuth authorization flow
- Token exchange and secure storage
- Refresh token management (daily refresh required)
- Advertiser account selection
- Connection status management (connect/disconnect)

**Does NOT cover:**
- Server-side event sending via Events API (see WAB-P-006)
- Ad spend data sync/import (separate feature)
- Ad management or creation

### 1.3 Dependencies
- NextAuth.js for session management
- Drizzle ORM for database operations
- TikTok for Business developer app
- `adPlatformConnections` table (existing)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Users can initiate TikTok OAuth from the Ad Platforms page | Must |
| FR-002 | System redirects to TikTok auth with correct app_id | Must |
| FR-003 | System handles OAuth callback and exchanges code for tokens | Must |
| FR-004 | Access tokens and refresh tokens are stored securely | Must |
| FR-005 | System retrieves authorized advertiser accounts after auth | Must |
| FR-006 | Users can select which advertiser account to connect | Should |
| FR-007 | Connection is created in `adPlatformConnections` table | Must |
| FR-008 | Users can disconnect their TikTok Ads account | Must |
| FR-009 | System refreshes access tokens daily (24-hour expiry) | Must |
| FR-010 | Errors during OAuth flow show user-friendly messages | Must |
| FR-011 | State parameter prevents CSRF attacks | Must |
| FR-012 | Users cannot connect same advertiser account twice | Should |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | OAuth callback response time | < 3 seconds |
| NFR-002 | Tokens encrypted at rest | AES-256 |
| NFR-003 | State token expiry | 10 minutes |
| NFR-004 | Token refresh before expiry | 1 hour buffer |
| NFR-005 | Background token refresh job | Every 12 hours |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Dashboard UI   │────▶│  API Routes     │────▶│  TikTok OAuth   │
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
        └──────────────▶│  TikTok         │
                        │  Marketing API  │
                        └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  Cron Job       │
                        │  (refresh)      │
                        └─────────────────┘
```

### 3.2 OAuth Flow Sequence

```
User clicks "Connect TikTok Ads"
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Generate state token, store in session                       │
│ 2. Redirect to TikTok OAuth:                                    │
│    https://ads.tiktok.com/marketing_api/auth                    │
│    ?app_id=xxx                                                  │
│    &redirect_uri=https://dashboard/api/auth/tiktok/callback     │
│    &state=xxx                                                   │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼ (User consents on TikTok)
        │
┌─────────────────────────────────────────────────────────────────┐
│ 3. TikTok redirects to callback with ?auth_code=xxx&state=xxx   │
│ 4. Verify state matches session                                 │
│ 5. Exchange auth_code for tokens:                               │
│    POST https://business-api.tiktok.com/open_api/v1.3/          │
│         oauth2/access_token/                                    │
│    {app_id, secret, auth_code}                                  │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Response includes: access_token, refresh_token,              │
│    advertiser_ids (list of authorized accounts)                 │
│ 7. Fetch advertiser details for each account                    │
│ 8. If multiple accounts, redirect to selection page             │
│ 9. Store connection in database                                 │
│ 10. Redirect to platforms page with success message             │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Token Refresh Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Cron job runs every 12 hours:                                   │
│ 1. Find all TikTok connections where token_expires_at < 2 hours │
│ 2. For each connection:                                         │
│    POST /oauth2/refresh_token/                                  │
│    {app_id, secret, refresh_token, grant_type: "refresh_token"} │
│ 3. Update access_token and token_expires_at in database         │
│ 4. Log success/failure                                          │
└─────────────────────────────────────────────────────────────────┘

Note: Refresh token valid for 1 year. After 1 year, user must re-authorize.
```

### 3.4 Data Structures

```typescript
// Environment variables required
interface TikTokEnv {
  TIKTOK_APP_ID: string;
  TIKTOK_APP_SECRET: string;
  TIKTOK_REDIRECT_URI: string;
}

// OAuth state stored in session/cookie
interface OAuthState {
  state: string;        // Random string for CSRF protection
  userId: string;       // Logged-in user ID
  expiresAt: number;    // Unix timestamp
}

// Token response from TikTok
interface TikTokTokenResponse {
  code: number;         // 0 = success
  message: string;
  data: {
    access_token: string;
    refresh_token: string;
    access_token_expire_in: number;   // Seconds (86400 = 24 hours)
    refresh_token_expire_in: number;  // Seconds (31536000 = 1 year)
    open_id: string;
    advertiser_ids: string[];         // List of authorized advertiser IDs
    scope: string[];
  };
}

// Refresh token response
interface TikTokRefreshResponse {
  code: number;
  message: string;
  data: {
    access_token: string;
    refresh_token: string;  // New refresh token (rotated)
    access_token_expire_in: number;
    refresh_token_expire_in: number;
  };
}

// Advertiser info from API
interface TikTokAdvertiser {
  advertiser_id: string;
  advertiser_name: string;
  currency: string;
  timezone: string;
  status: string;        // "STATUS_ENABLE", "STATUS_DISABLE", etc.
  company: string;
}

// Connection record (extends existing schema)
interface TikTokConnection {
  id: string;
  userId: string;
  platform: "tiktok";
  accountId: string;           // Advertiser ID
  accountName: string | null;  // Advertiser name
  accessToken: string;         // Encrypted
  refreshToken: string;        // Encrypted
  tokenExpiresAt: Date;        // ~24 hours from last refresh
  refreshTokenExpiresAt: Date; // ~1 year from auth
  status: "active" | "expired" | "disconnected";
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.5 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/tiktok` | Initiate OAuth flow |
| GET | `/api/auth/tiktok/callback` | Handle OAuth callback |
| POST | `/api/auth/tiktok/select-account` | Select advertiser (if multiple) |
| POST | `/api/auth/tiktok/refresh` | Manually refresh token |
| DELETE | `/api/platforms/[id]` | Disconnect (existing) |

### 3.6 Cron Endpoint

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/cron/tiktok-refresh` | Refresh expiring tokens (protected) |

---

## 4. Public Interface

### 4.1 Methods

#### `GET /api/auth/tiktok`

**Description:** Initiates the TikTok OAuth flow by redirecting to TikTok's authorization page.

**Authentication:** Required (NextAuth session)

**Query Parameters:** None

**Behavior:**
1. Verify user is authenticated
2. Generate cryptographically random state token
3. Store state in encrypted cookie (10-minute expiry)
4. Redirect to TikTok Marketing API auth URL

**Returns:** 302 Redirect to TikTok auth

**Errors:**
- 401: Unauthorized (no session)

---

#### `GET /api/auth/tiktok/callback`

**Description:** Handles the OAuth callback from TikTok, exchanges auth_code for tokens, and creates the connection.

**Authentication:** Required (NextAuth session)

**Query Parameters:**
- `auth_code` (string): Authorization code from TikTok
- `state` (string): State token for CSRF verification

**Behavior:**
1. Verify state matches stored value
2. Exchange auth_code for access_token and refresh_token
3. Extract advertiser_ids from response
4. Fetch advertiser details for each ID
5. If single advertiser: create connection and redirect
6. If multiple advertisers: redirect to selection page

**Returns:** 302 Redirect to `/dashboard/platforms` or `/dashboard/platforms/tiktok/select`

**Errors:**
- 400: Invalid state (CSRF protection)
- 400: Missing auth_code
- 401: Unauthorized
- 500: Token exchange failed

---

#### `POST /api/auth/tiktok/select-account`

**Description:** Completes connection after user selects which advertiser account to connect.

**Authentication:** Required (NextAuth session)

**Request Body:**
```json
{
  "advertiserId": "7012345678901234567"
}
```

**Behavior:**
1. Verify tokens exist in temporary storage
2. Verify selected advertiser is in authorized list
3. Create connection in `adPlatformConnections`
4. Clear temporary token storage

**Returns:**
```json
{
  "success": true,
  "connection": {
    "id": "uuid",
    "platform": "tiktok",
    "accountId": "7012345678901234567",
    "accountName": "My TikTok Ads Account",
    "status": "active"
  }
}
```

**Errors:**
- 400: Invalid advertiser ID
- 401: Unauthorized
- 404: No pending tokens found
- 409: Account already connected

---

#### `POST /api/auth/tiktok/refresh`

**Description:** Refreshes an expired or expiring access token using the refresh token.

**Authentication:** Required (NextAuth session)

**Request Body:**
```json
{
  "connectionId": "uuid"
}
```

**Behavior:**
1. Verify user owns the connection
2. Call TikTok OAuth refresh endpoint
3. Update access_token, refresh_token, and expiry in database
4. Note: TikTok rotates refresh tokens on each refresh

**Returns:**
```json
{
  "success": true,
  "expiresAt": "2026-01-26T12:00:00Z"
}
```

**Errors:**
- 401: Unauthorized
- 404: Connection not found
- 400: Refresh token expired (requires re-auth after 1 year)

---

#### `POST /api/cron/tiktok-refresh`

**Description:** Background job to refresh TikTok tokens that are expiring soon.

**Authentication:** Cron secret header

**Headers:**
- `Authorization: Bearer {CRON_SECRET}`

**Behavior:**
1. Find all TikTok connections where token_expires_at < now + 2 hours
2. For each connection, attempt token refresh
3. Update database with new tokens
4. Log results

**Returns:**
```json
{
  "refreshed": 5,
  "failed": 1,
  "skipped": 10
}
```

---

## 5. Error Handling

### 5.1 Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| TIKTOK_AUTH_DENIED | User denied access | User clicked "Cancel" | Inform user, allow retry |
| TIKTOK_INVALID_STATE | Invalid state parameter | CSRF attack or expired state | Restart OAuth flow |
| TIKTOK_TOKEN_EXCHANGE_FAILED | Failed to exchange code | Invalid code or server error | Restart OAuth flow |
| TIKTOK_ACCESS_TOKEN_EXPIRED | Access token expired | Token > 24 hours old | Refresh token or re-auth |
| TIKTOK_REFRESH_TOKEN_EXPIRED | Refresh token expired | Token > 1 year old | Re-authenticate |
| TIKTOK_ACCOUNT_ALREADY_CONNECTED | Account already connected | Duplicate connection | Show existing connection |
| TIKTOK_NO_ADVERTISERS | No advertiser accounts | User has no ad accounts | Inform user to set up Ads |
| TIKTOK_API_ERROR | TikTok API error | API returned error code | Check code, retry or log |

### 5.2 TikTok API Error Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 40001 | Invalid parameters |
| 40002 | Unauthorized |
| 40100 | Access token expired |
| 40101 | Invalid access token |
| 40104 | Refresh token expired |

### 5.3 Logging

- **Level:** Info for successful auth/refresh, Error for failures
- **Format:** `[TikTok OAuth] [User ID/Connection ID] [Action] [Details]`
- **Sensitive data:** Never log tokens, only connection IDs

---

## 6. Security Considerations

- **Token Encryption:** Access and refresh tokens encrypted with AES-256-GCM
- **State Parameter:** Cryptographically random, single-use, 10-minute expiry
- **HTTPS Only:** All OAuth redirects and callbacks over HTTPS
- **Refresh Token Rotation:** TikTok rotates refresh tokens; always store newest
- **Short-lived Access Tokens:** 24-hour expiry requires proactive refresh
- **Cron Security:** Refresh cron endpoint protected by secret header
- **Token Expiry Tracking:** Store both access and refresh token expiry dates

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_initiate_redirects_to_tiktok | Start OAuth flow | 302 redirect with correct URL |
| test_initiate_requires_auth | No session | 401 Unauthorized |
| test_initiate_generates_state | State parameter | Valid random string stored |
| test_callback_validates_state | Mismatched state | 400 Invalid state |
| test_callback_exchanges_auth_code | Valid auth_code | Tokens received |
| test_callback_extracts_advertiser_ids | Token response | Advertiser IDs parsed |
| test_callback_single_advertiser | One advertiser | Connection created directly |
| test_callback_multiple_advertisers | Multiple advertisers | Redirect to selection page |
| test_select_account_creates_connection | Valid selection | Connection in database |
| test_select_account_prevents_duplicate | Already connected | 409 Conflict |
| test_refresh_updates_tokens | Valid refresh token | New tokens stored |
| test_refresh_rotates_refresh_token | After refresh | New refresh token stored |
| test_refresh_expired_refresh | 1 year old token | 400 error, requires re-auth |
| test_cron_refresh_expiring_tokens | Tokens expiring soon | Tokens refreshed |
| test_cron_skips_valid_tokens | Tokens not expiring | No action taken |
| test_token_encryption | Store and retrieve | Tokens decrypted correctly |

### 7.2 Integration Tests

- Complete OAuth flow with mocked TikTok responses
- Token refresh cycle simulation
- Multi-advertiser selection flow
- Cron job refresh process
- Disconnect and reconnect same account

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `dashboard/src/app/api/auth/tiktok/route.ts`
  - `dashboard/src/app/api/auth/tiktok/callback/route.ts`
  - `dashboard/src/app/api/auth/tiktok/select-account/route.ts`
  - `dashboard/src/app/api/auth/tiktok/refresh/route.ts`
  - `dashboard/src/app/api/cron/tiktok-refresh/route.ts`
  - `dashboard/src/lib/tiktok.ts`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `dashboard/src/app/api/auth/tiktok/route.ts` | Initiate OAuth |
| `dashboard/src/app/api/auth/tiktok/callback/route.ts` | Handle callback |
| `dashboard/src/app/api/auth/tiktok/select-account/route.ts` | Account selection |
| `dashboard/src/app/api/auth/tiktok/refresh/route.ts` | Manual token refresh |
| `dashboard/src/app/api/cron/tiktok-refresh/route.ts` | Background refresh job |
| `dashboard/src/lib/tiktok.ts` | TikTok API helpers |
| `dashboard/src/lib/encryption.ts` | Token encryption utilities |
| `dashboard/src/app/dashboard/platforms/tiktok/select/page.tsx` | Account selection UI |

### 8.2 Environment Variables

```env
# TikTok for Business App
TIKTOK_APP_ID=7012345678901234567
TIKTOK_APP_SECRET=xxx
TIKTOK_REDIRECT_URI=https://dashboard.example.com/api/auth/tiktok/callback

# Cron job security
CRON_SECRET=xxx

# Token encryption (shared with other OAuth integrations)
TOKEN_ENCRYPTION_KEY=32-byte-hex-string
```

### 8.3 TikTok for Business Setup

1. Create developer account at ads.tiktok.com/marketing_api
2. Create an app
3. Note App ID and App Secret
4. Configure OAuth:
   - Add redirect URI
   - Select required permissions
5. Submit for review (production)

### 8.4 Cron Job Setup

For Vercel:
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/tiktok-refresh",
      "schedule": "0 */12 * * *"
    }
  ]
}
```

For other platforms, set up a cron job to call the endpoint every 12 hours.

### 8.5 Known Limitations

- Access tokens expire in 24 hours (require daily refresh)
- Refresh tokens expire in 1 year (require re-authorization)
- TikTok rotates refresh tokens on each use
- API rate limits apply
- App review required for production

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-25 | Initial spec |
