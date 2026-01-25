# Plan: TikTok Ads OAuth Connection (Issue #17)

## Problem Statement
Users need to connect their TikTok Ads accounts to the WAB Dashboard for ad spend data import and ROAS calculation. TikTok has unique requirements: 24-hour access tokens requiring daily refresh via cron job.

## Proposed Solution
Implement TikTok OAuth 2.0 flow following the same patterns as Google/Meta but with TikTok-specific differences:
- Use TikTok Marketing API auth URL
- Handle 24-hour access token expiry
- Store and rotate refresh tokens (1-year validity)
- Implement cron job for background token refresh

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Token Type | Access (24h) + Refresh (1 year) | TikTok requires refresh tokens |
| API Version | v1.3 | Current Marketing API version |
| Refresh Strategy | Cron every 12 hours | Refresh before 24h expiry |
| Refresh Token Rotation | Store new on each refresh | TikTok rotates refresh tokens |

## Key Differences from Google/Meta
1. **Short-lived access tokens**: 24 hours vs Meta's 60 days
2. **Refresh tokens**: TikTok uses them (unlike Meta)
3. **Token rotation**: New refresh token on each use
4. **Cron required**: Daily token refresh via background job
5. **API structure**: `business-api.tiktok.com` endpoints

## File Changes
| File | Action | Purpose |
|------|--------|---------|
| `dashboard/src/lib/tiktok.ts` | Create | TikTok API helpers |
| `dashboard/tests/lib/tiktok.test.ts` | Create | TDD tests for helpers |
| `dashboard/src/app/api/auth/tiktok/route.ts` | Create | Initiate OAuth flow |
| `dashboard/src/app/api/auth/tiktok/callback/route.ts` | Create | Handle callback |
| `dashboard/src/app/api/auth/tiktok/select-account/route.ts` | Create | Account selection |
| `dashboard/src/app/api/auth/tiktok/refresh/route.ts` | Create | Token refresh |
| `dashboard/src/app/api/auth/tiktok/pending/route.ts` | Create | Fetch pending token data |
| `dashboard/src/app/api/cron/tiktok-refresh/route.ts` | Create | Background refresh job |
| `dashboard/tests/api/auth/tiktok.test.ts` | Create | TDD tests for routes |
| `dashboard/src/app/dashboard/platforms/tiktok/select/page.tsx` | Create | Account selection UI |
| `dashboard/src/app/dashboard/platforms/page.tsx` | Modify | Enable TikTok OAuth |

## Testing Strategy
- Unit tests: Test all TikTok API helpers with mocked fetch responses
- Integration tests: Test OAuth routes with mocked auth/db
- Cron tests: Test refresh logic with expiring tokens
- Follow TDD: Write tests first (Red), implement to pass (Green)

## Implementation Order (TDD)
1. Write TikTok API helper tests (Red)
2. Implement TikTok API helpers (Green)
3. Write OAuth route tests (Red)
4. Implement OAuth routes (Green)
5. Write cron job tests (Red)
6. Implement cron job (Green)
7. Create account selection UI
8. Update platforms page to enable TikTok
9. Run all tests to verify
