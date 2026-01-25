# WAB-D-007 Meta Ads OAuth Connection

> **Status:** Draft
> **Author:** Claude
> **Created:** 2026-01-25
> **Updated:** 2026-01-25

## 1. Overview

### 1.1 Purpose
Enable users to connect their Meta (Facebook/Instagram) Ads accounts to the WAB Dashboard via OAuth 2.0, allowing the dashboard to pull ad spend data for ROAS calculation and campaign performance analysis.

### 1.2 Scope
**Covers:**
- Meta OAuth 2.0 authorization flow (Facebook Login)
- Token exchange and secure storage
- Long-lived token conversion (60-day tokens)
- Ad account selection for users with multiple accounts
- Connection status management (connect/disconnect)

**Does NOT cover:**
- Server-side conversion sending via CAPI (see WAB-P-004)
- Ad spend data sync/import (separate feature)
- Ad management or creation

### 1.3 Dependencies
- NextAuth.js for session management
- Drizzle ORM for database operations
- Meta App (from Meta for Developers)
- `adPlatformConnections` table (existing)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Users can initiate Meta OAuth from the Ad Platforms page | Must |
| FR-002 | System redirects to Facebook Login with correct scopes | Must |
| FR-003 | System handles OAuth callback and exchanges code for tokens | Must |
| FR-004 | Short-lived token exchanged for long-lived token (60 days) | Must |
| FR-005 | System retrieves user's ad accounts after auth | Must |
| FR-006 | Users can select which ad account to connect | Should |
| FR-007 | Connection is created in `adPlatformConnections` table | Must |
| FR-008 | Users can disconnect their Meta Ads account | Must |
| FR-009 | System refreshes tokens before expiry | Must |
| FR-010 | Errors during OAuth flow show user-friendly messages | Must |
| FR-011 | State parameter prevents CSRF attacks | Must |
| FR-012 | Users cannot connect same ad account twice | Should |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | OAuth callback response time | < 3 seconds |
| NFR-002 | Tokens encrypted at rest | AES-256 |
| NFR-003 | State token expiry | 10 minutes |
| NFR-004 | Token refresh before expiry | 7 days buffer |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Dashboard UI   │────▶│  API Routes     │────▶│  Facebook OAuth │
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
        └──────────────▶│  Meta Graph API │
                        │  (ad accounts)  │
                        └─────────────────┘
```

### 3.2 OAuth Flow Sequence

```
User clicks "Connect Meta Ads"
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Generate state token, store in session                       │
│ 2. Redirect to Facebook OAuth:                                  │
│    https://www.facebook.com/v18.0/dialog/oauth                  │
│    ?client_id=xxx                                               │
│    &redirect_uri=https://dashboard/api/auth/meta/callback       │
│    &response_type=code                                          │
│    &scope=ads_read,ads_management,business_management           │
│    &state=xxx                                                   │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼ (User consents on Facebook)
        │
┌─────────────────────────────────────────────────────────────────┐
│ 3. Facebook redirects to callback with ?code=xxx&state=xxx      │
│ 4. Verify state matches session                                 │
│ 5. Exchange code for short-lived token:                         │
│    GET /oauth/access_token?code=xxx&client_id=xxx&...           │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Exchange for long-lived token (60 days):                     │
│    GET /oauth/access_token?grant_type=fb_exchange_token&...     │
│ 7. Fetch user's ad accounts:                                    │
│    GET /me/adaccounts?fields=id,name,currency,timezone_name     │
│ 8. If multiple accounts, redirect to selection page             │
│ 9. Store connection in database                                 │
│ 10. Redirect to platforms page with success message             │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Data Structures

```typescript
// Environment variables required
interface MetaEnv {
  META_APP_ID: string;
  META_APP_SECRET: string;
  META_REDIRECT_URI: string;
}

// OAuth state stored in session/cookie
interface OAuthState {
  state: string;        // Random string for CSRF protection
  userId: string;       // Logged-in user ID
  expiresAt: number;    // Unix timestamp
}

// Token response from Meta (short-lived)
interface MetaTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;  // Seconds (usually ~1 hour for short-lived)
}

// Long-lived token response
interface MetaLongLivedTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;  // Seconds (~60 days = 5184000)
}

// Ad account from Graph API
interface MetaAdAccount {
  id: string;             // Format: "act_1234567890"
  name: string;
  account_id: string;     // Numeric ID without "act_" prefix
  currency: string;       // e.g., "USD", "GBP"
  timezone_name: string;  // e.g., "Europe/London"
  account_status: number; // 1 = active, 2 = disabled, etc.
}

// Ad accounts response
interface MetaAdAccountsResponse {
  data: MetaAdAccount[];
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
  };
}

// Connection record (extends existing schema)
interface MetaConnection {
  id: string;
  userId: string;
  platform: "meta";
  accountId: string;           // Ad account ID (without "act_" prefix)
  accountName: string | null;  // Ad account name
  accessToken: string;         // Encrypted long-lived token
  refreshToken: string | null; // Meta doesn't use refresh tokens
  tokenExpiresAt: Date;        // ~60 days from creation
  status: "active" | "expired" | "disconnected";
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.4 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/meta` | Initiate OAuth flow |
| GET | `/api/auth/meta/callback` | Handle OAuth callback |
| POST | `/api/auth/meta/select-account` | Select ad account (if multiple) |
| POST | `/api/auth/meta/refresh` | Get new long-lived token |
| DELETE | `/api/platforms/[id]` | Disconnect (existing) |

---

## 4. Public Interface

### 4.1 Methods

#### `GET /api/auth/meta`

**Description:** Initiates the Meta OAuth flow by redirecting to Facebook Login.

**Authentication:** Required (NextAuth session)

**Query Parameters:** None

**Behavior:**
1. Verify user is authenticated
2. Generate cryptographically random state token
3. Store state in encrypted cookie (10-minute expiry)
4. Redirect to Facebook OAuth dialog

**Returns:** 302 Redirect to Facebook Login

**Errors:**
- 401: Unauthorized (no session)

---

#### `GET /api/auth/meta/callback`

**Description:** Handles the OAuth callback from Facebook, exchanges code for tokens, and creates the connection.

**Authentication:** Required (NextAuth session)

**Query Parameters:**
- `code` (string): Authorization code from Facebook
- `state` (string): State token for CSRF verification
- `error` (string, optional): Error code if user denied access
- `error_reason` (string, optional): Human-readable error reason

**Behavior:**
1. Verify state matches stored value
2. If error, redirect to platforms page with error message
3. Exchange code for short-lived access token
4. Exchange short-lived token for long-lived token (60 days)
5. Fetch user's ad accounts via Graph API
6. If single account: create connection and redirect
7. If multiple accounts: redirect to account selection page

**Returns:** 302 Redirect to `/dashboard/platforms` or `/dashboard/platforms/meta/select`

**Errors:**
- 400: Invalid state (CSRF protection)
- 400: Missing authorization code
- 401: Unauthorized
- 500: Token exchange failed

---

#### `POST /api/auth/meta/select-account`

**Description:** Completes connection after user selects which ad account to connect.

**Authentication:** Required (NextAuth session)

**Request Body:**
```json
{
  "accountId": "1234567890"
}
```

**Behavior:**
1. Verify tokens exist in temporary storage
2. Verify selected account is in user's accessible accounts
3. Create connection in `adPlatformConnections`
4. Clear temporary token storage

**Returns:**
```json
{
  "success": true,
  "connection": {
    "id": "uuid",
    "platform": "meta",
    "accountId": "1234567890",
    "accountName": "My Ad Account",
    "status": "active"
  }
}
```

**Errors:**
- 400: Invalid account ID
- 401: Unauthorized
- 404: No pending tokens found
- 409: Account already connected

---

#### `POST /api/auth/meta/refresh`

**Description:** Exchanges current long-lived token for a new one (extends expiry).

**Authentication:** Required (NextAuth session)

**Request Body:**
```json
{
  "connectionId": "uuid"
}
```

**Behavior:**
1. Verify user owns the connection
2. Verify current token is still valid
3. Exchange current token for new long-lived token
4. Update token and expiry in database

**Note:** Meta tokens can only be refreshed if they haven't expired. Unlike Google, there's no separate refresh token.

**Returns:**
```json
{
  "success": true,
  "expiresAt": "2026-03-25T12:00:00Z"
}
```

**Errors:**
- 401: Unauthorized
- 404: Connection not found
- 400: Token expired (requires re-auth)

---

## 5. Error Handling

### 5.1 Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| META_AUTH_DENIED | User denied access | User clicked "Cancel" | Inform user, allow retry |
| META_INVALID_STATE | Invalid state parameter | CSRF attack or expired state | Restart OAuth flow |
| META_TOKEN_EXCHANGE_FAILED | Failed to exchange code | Invalid code or server error | Restart OAuth flow |
| META_TOKEN_EXPIRED | Access token expired | Token > 60 days old | Re-authenticate |
| META_ACCOUNT_ALREADY_CONNECTED | Account already connected | Duplicate connection | Show existing connection |
| META_NO_AD_ACCOUNTS | No ad accounts found | User has no ad accounts | Inform user to set up Business |
| META_INSUFFICIENT_PERMISSIONS | Missing required permissions | User didn't grant all scopes | Re-authenticate with scopes |

### 5.2 Logging

- **Level:** Info for successful auth, Error for failures
- **Format:** `[Meta OAuth] [User ID] [Action] [Details]`
- **Sensitive data:** Never log tokens, only connection IDs

---

## 6. Security Considerations

- **Token Encryption:** Access tokens encrypted with AES-256-GCM before storage
- **State Parameter:** Cryptographically random, single-use, 10-minute expiry
- **HTTPS Only:** All OAuth redirects and callbacks over HTTPS
- **App Secret Proof:** Use `appsecret_proof` for API calls (HMAC of access_token with app_secret)
- **Scope Minimization:** Request only `ads_read`, `ads_management`, `business_management`
- **Token Expiry:** Long-lived tokens expire in 60 days; set up reminders
- **No Refresh Token:** Meta uses token exchange, not refresh tokens
- **Revocation:** On disconnect, invalidate token via Graph API

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_initiate_redirects_to_facebook | Start OAuth flow | 302 redirect with correct URL |
| test_initiate_requires_auth | No session | 401 Unauthorized |
| test_initiate_includes_correct_scopes | Check redirect URL | Contains required scopes |
| test_callback_validates_state | Mismatched state | 400 Invalid state |
| test_callback_handles_user_denial | User denies access | Redirect with error message |
| test_callback_exchanges_code | Valid code | Short-lived token received |
| test_callback_gets_long_lived_token | After short-lived | Long-lived token received |
| test_callback_fetches_ad_accounts | After token exchange | Ad accounts list retrieved |
| test_callback_single_account | One ad account | Connection created directly |
| test_callback_multiple_accounts | Multiple ad accounts | Redirect to selection page |
| test_select_account_creates_connection | Valid selection | Connection in database |
| test_select_account_prevents_duplicate | Already connected | 409 Conflict |
| test_refresh_extends_token | Valid token | New token with extended expiry |
| test_refresh_expired_token | Expired token | 400 error, requires re-auth |
| test_token_encryption | Store and retrieve | Tokens decrypted correctly |
| test_appsecret_proof | API call | Proof header included |

### 7.2 Integration Tests

- Complete OAuth flow with mocked Meta responses
- Long-lived token exchange
- Multi-account selection flow
- Token refresh before expiry
- Disconnect and reconnect same account

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `dashboard/src/app/api/auth/meta/route.ts`
  - `dashboard/src/app/api/auth/meta/callback/route.ts`
  - `dashboard/src/app/api/auth/meta/select-account/route.ts`
  - `dashboard/src/app/api/auth/meta/refresh/route.ts`
  - `dashboard/src/lib/meta.ts`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `dashboard/src/app/api/auth/meta/route.ts` | Initiate OAuth |
| `dashboard/src/app/api/auth/meta/callback/route.ts` | Handle callback |
| `dashboard/src/app/api/auth/meta/select-account/route.ts` | Account selection |
| `dashboard/src/app/api/auth/meta/refresh/route.ts` | Token refresh |
| `dashboard/src/lib/meta.ts` | Meta Graph API helpers |
| `dashboard/src/lib/encryption.ts` | Token encryption utilities |
| `dashboard/src/app/dashboard/platforms/meta/select/page.tsx` | Account selection UI |

### 8.2 Environment Variables

```env
# Meta App (from Meta for Developers)
META_APP_ID=123456789012345
META_APP_SECRET=xxx
META_REDIRECT_URI=https://dashboard.example.com/api/auth/meta/callback

# Token encryption (shared with other OAuth integrations)
TOKEN_ENCRYPTION_KEY=32-byte-hex-string
```

### 8.3 Meta for Developers Setup

1. Create app at developers.facebook.com
2. Add "Facebook Login" product
3. Configure OAuth settings:
   - Add redirect URI
   - Enable "Client OAuth Login"
   - Enable "Web OAuth Login"
4. Add "Marketing API" product
5. Configure App Review:
   - Request `ads_read` permission
   - Request `ads_management` permission
   - Request `business_management` permission
6. For production: Complete App Review process

### 8.4 Graph API Version

- Use Graph API v18.0 or later
- Update version periodically (Meta deprecates old versions)
- Store version in config for easy updates

### 8.5 Known Limitations

- Long-lived tokens expire in 60 days (no automatic refresh)
- Must re-authenticate if token expires
- App Review required for production use
- Some permissions require Business Verification
- Rate limits apply to Graph API calls

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-25 | Initial spec |
