# Plan: Google Ads OAuth Connection (Issue #15)

## Problem Statement

Users cannot connect their Google Ads accounts to the WAB Dashboard. Clicking "Connect Google Ads" shows a placeholder "Coming Soon" message. Without this connection, the dashboard cannot:
- Pull ad spend data from Google Ads
- Calculate accurate ROAS for Google campaigns
- Correlate conversions with ad spend

## Proposed Solution

Implement a complete OAuth 2.0 flow for Google Ads that:
1. Redirects users to Google's consent screen
2. Handles the OAuth callback and token exchange
3. Fetches accessible Google Ads accounts
4. Allows account selection (if multiple)
5. Stores encrypted tokens in the database
6. Provides token refresh capability

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Token encryption | AES-256-GCM | Industry standard, authenticated encryption |
| State storage | Encrypted cookie | Stateless, works with serverless |
| Token storage | Database (encrypted) | Persistent, supports multiple connections |
| Account fetch | Google Ads API v15 | Latest stable version |
| Temp token storage | Database table | Survives page navigation during account selection |

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `dashboard/src/lib/encryption.ts` | Create | AES-256-GCM encryption/decryption utilities |
| `dashboard/src/lib/google-ads.ts` | Create | Google Ads API client and helpers |
| `dashboard/src/app/api/auth/google-ads/route.ts` | Create | OAuth initiation endpoint |
| `dashboard/src/app/api/auth/google-ads/callback/route.ts` | Create | OAuth callback handler |
| `dashboard/src/app/api/auth/google-ads/select-account/route.ts` | Create | Account selection endpoint |
| `dashboard/src/app/api/auth/google-ads/refresh/route.ts` | Create | Token refresh endpoint |
| `dashboard/src/app/dashboard/platforms/google-ads/select/page.tsx` | Create | Account selection UI |
| `dashboard/src/app/dashboard/platforms/page.tsx` | Modify | Wire up Connect button to OAuth |
| `dashboard/src/db/schema.ts` | Modify | Add pending_oauth_tokens table |
| `dashboard/__tests__/lib/encryption.test.ts` | Create | Encryption utility tests |
| `dashboard/__tests__/lib/google-ads.test.ts` | Create | Google Ads helper tests |
| `dashboard/__tests__/api/auth/google-ads/*.test.ts` | Create | API route tests |

## Database Changes

Add a table for temporary OAuth token storage during account selection:

```sql
CREATE TABLE pending_oauth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    accounts JSONB,  -- List of accessible accounts
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL  -- Auto-cleanup after 10 minutes
);
```

## Testing Strategy

### Unit Tests (TDD - Write First)
1. **Encryption utilities**
   - encrypt/decrypt roundtrip
   - handles empty strings
   - different keys produce different ciphertext

2. **Google Ads helpers**
   - buildAuthUrl generates correct URL
   - exchangeCode handles success/error
   - fetchAccessibleCustomers parses response
   - refreshToken updates correctly

3. **API Routes**
   - Initiation redirects with correct params
   - Callback validates state
   - Callback exchanges code for tokens
   - Select-account creates connection
   - Refresh updates tokens

### Integration Tests
- Full OAuth flow with mocked Google responses
- Account selection flow
- Error handling (denied access, invalid state)

### Coverage Target
- Minimum: 80%
- Focus on: encryption.ts, google-ads.ts, all route handlers

## Implementation Order

1. **Phase 1: Infrastructure** (TDD)
   - Write encryption tests → implement encryption.ts
   - Write google-ads helper tests → implement google-ads.ts
   - Add pending_oauth_tokens to schema

2. **Phase 2: OAuth Routes** (TDD)
   - Write route tests → implement routes
   - Order: initiate → callback → select-account → refresh

3. **Phase 3: UI**
   - Account selection page
   - Update platforms page Connect button

4. **Phase 4: Integration**
   - End-to-end testing
   - Error handling polish

## Rollout Considerations

- Environment variables must be configured before deployment
- Google Cloud Console OAuth credentials needed
- Developer token from Google Ads API Center required
- Consider feature flag for gradual rollout
- Monitor for OAuth errors in production logs

## Security Checklist

- [ ] Tokens encrypted at rest (AES-256-GCM)
- [ ] State parameter prevents CSRF
- [ ] State has short expiry (10 minutes)
- [ ] HTTPS-only redirects
- [ ] No tokens in logs
- [ ] Pending tokens auto-expire
