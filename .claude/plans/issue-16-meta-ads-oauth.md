# Plan: Meta Ads OAuth Connection (Issue #16)

## Problem Statement
Users need to connect their Meta (Facebook/Instagram) Ads accounts to the WAB Dashboard for ad spend data import and ROAS calculation. Currently, only Google Ads OAuth is implemented.

## Proposed Solution
Implement Meta OAuth 2.0 flow following the same patterns as Google Ads but with Meta-specific differences:
- Use Facebook Login dialog instead of Google OAuth
- Exchange short-lived token for long-lived token (60 days)
- Include `appsecret_proof` in Graph API calls
- Handle Meta's different token refresh mechanism (token exchange, not refresh tokens)

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Token Type | Long-lived (60 days) | Meta doesn't use refresh tokens; must re-auth after expiry |
| API Version | v18.0 | Latest stable Graph API version |
| Scopes | ads_read, ads_management, business_management | Required for ad account access and spend data |
| App Secret Proof | Include in all API calls | Meta security best practice |
| Account ID format | Store without "act_" prefix | Consistent with other platforms |

## File Changes
| File | Action | Purpose |
|------|--------|---------|
| `dashboard/src/lib/meta.ts` | Create | Meta Graph API helpers |
| `dashboard/tests/lib/meta.test.ts` | Create | TDD tests for helpers |
| `dashboard/src/app/api/auth/meta/route.ts` | Create | Initiate OAuth flow |
| `dashboard/src/app/api/auth/meta/callback/route.ts` | Create | Handle callback |
| `dashboard/src/app/api/auth/meta/select-account/route.ts` | Create | Account selection |
| `dashboard/src/app/api/auth/meta/refresh/route.ts` | Create | Token refresh |
| `dashboard/src/app/api/auth/meta/pending/route.ts` | Create | Fetch pending token data |
| `dashboard/tests/api/auth/meta.test.ts` | Create | TDD tests for routes |
| `dashboard/src/app/dashboard/platforms/meta/select/page.tsx` | Create | Account selection UI |
| `dashboard/src/app/dashboard/platforms/page.tsx` | Modify | Enable Meta OAuth button |

## Testing Strategy
- Unit tests: Test all Meta API helpers with mocked fetch responses
- Integration tests: Test OAuth routes with mocked auth/db
- Follow TDD: Write tests first (Red), implement to pass (Green), refactor

## Key Differences from Google Ads
1. **Token Exchange**: Meta requires exchanging short-lived token → long-lived token (not automatic)
2. **No Refresh Token**: Must re-authenticate when 60-day token expires
3. **App Secret Proof**: HMAC of access_token with app_secret required for API calls
4. **Ad Account ID Format**: Meta uses "act_1234567890" format; store numeric part only
5. **Graph API**: Different endpoint structure than Google Ads API

## Implementation Order (TDD)
1. Write Meta API helper tests (Red)
2. Implement Meta API helpers (Green)
3. Write OAuth route tests (Red)
4. Implement OAuth routes (Green)
5. Create account selection UI
6. Update platforms page to enable Meta
7. Run all tests to verify
