# WooCommerce Attribution Bridge

A first-party attribution tracking plugin for WooCommerce that captures ad platform click IDs and sends conversion data to multiple destinations.

## Project Overview

**Problem:** GA4 only captures ~48% of conversions due to ad blockers, cookie consent, and iOS privacy features. Ad platforms (Meta, Google, TikTok) receive incomplete conversion data, degrading their algorithms.

**Solution:** A lightweight WooCommerce plugin that:
1. Captures click IDs (fbclid, gclid, ttclid, etc.) on arrival
2. Stores them in first-party cookies (survives sessions)
3. On conversion, sends data to multiple destinations:
   - Swetrix (self-hosted analytics)
   - Meta Conversions API (CAPI)
   - Google Ads Conversion API
   - TikTok Events API

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  User clicks ad with ?gclid=XXX&fbclid=YYY              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Frontend JS: Capture click IDs → first-party cookie    │
│  (urushop.co.uk domain, HttpOnly, 90-day expiry)       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  User browses, maybe leaves, returns later              │
│  (click IDs persist in cookie)                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  User converts (places order)                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  WooCommerce Hook: woocommerce_order_status_completed   │
│  Retrieve click IDs from cookie/order meta              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Send to destinations (async, server-side):             │
│  ├─→ Swetrix Events API (custom purchase event)        │
│  ├─→ Meta CAPI (with fbclid + user data)               │
│  ├─→ Google Ads Conversion API (with gclid)            │
│  └─→ TikTok Events API (with ttclid)                   │
└─────────────────────────────────────────────────────────┘
```

## Key Features

- **First-party only**: All data stays on your domain
- **Server-side sending**: Bypasses ad blockers for conversions
- **Multi-platform**: Single source of truth for all ad platforms
- **Privacy-conscious**: Only stores what's needed for attribution
- **Cookie-less fallback**: Server-side attribution for users who decline cookies
- **Consent-aware**: Integrates with popular consent management plugins
- **Extensible**: Easy to add new destination platforms

## Attribution Storage

The plugin uses a dual-storage approach to maximize attribution coverage:

### 1. Cookie-Based (Primary)
When users accept cookies (via consent management), click IDs are stored in a first-party cookie (`wab_a`) with a 90-day expiry. This is the most reliable method for multi-session attribution.

### 2. Server-Side Cache (Fallback)
For users who decline cookies or when cookies are unavailable, click IDs are stored server-side in the `wp_wab_attribution_cache` table using a fingerprint hash:

```
Fingerprint = SHA256(IP + "|" + User-Agent + "|" + wp_salt())
```

**Key characteristics:**
- **48-hour TTL**: Short expiry since IP/UA combinations aren't stable long-term
- **Not tracking**: This is attribution linking, not user tracking. We don't identify users—we link click IDs to conversions.
- **GDPR compliant**: The fingerprint is a one-way hash that cannot be reversed to identify individuals
- **Automatic cleanup**: Expired entries are purged hourly via cron

### Attribution Flow

```
User arrives with ?gclid=XXX&fbclid=YYY
            ↓
┌───────────────────────────────────────┐
│ Always: Store in server-side cache    │
│ (fingerprint_hash → click_ids)        │
└───────────────────────────────────────┘
            ↓
┌───────────────────────────────────────┐
│ If consent: Also store in cookie      │
│ (wab_a → JSON with click_ids)         │
└───────────────────────────────────────┘
            ↓
On conversion:
┌───────────────────────────────────────┐
│ 1. Check cookie first                 │
│ 2. If empty, fall back to server-side │
│ 3. Send attribution to ad platforms   │
└───────────────────────────────────────┘
```

### Cookie Consent Integration

The plugin integrates with popular consent management plugins:
- CookieYes
- CookieBot
- Complianz
- GDPR Cookie Consent

Consent levels:
- `LEVEL_FULL` (marketing cookies accepted): Full cookie + server-side storage
- `LEVEL_ANONYMOUS` (analytics only): Server-side storage only
- `LEVEL_NONE` (no consent): Server-side storage only

## Technical Stack

- PHP 8.0+ (WordPress/WooCommerce plugin)
- JavaScript (frontend click ID capture)
- WooCommerce hooks for order events
- HTTP client for API calls (wp_remote_post)

## Destinations

### Swetrix (Self-hosted Analytics)
- Endpoint: Your self-hosted instance or `https://api.swetrix.com`
- Events API: POST /log/custom
- Docs: https://docs.swetrix.com/events-api

### Meta Conversions API (CAPI)
- Endpoint: `https://graph.facebook.com/v18.0/{pixel_id}/events`
- Requires: Access Token, Pixel ID, fbclid
- Docs: https://developers.facebook.com/docs/marketing-api/conversions-api

### Google Ads Conversion API
- Endpoint: `https://www.google-analytics.com/mp/collect` (Measurement Protocol)
- Or: Google Ads API for offline conversions
- Requires: Measurement ID, API Secret, gclid
- Docs: https://developers.google.com/analytics/devguides/collection/protocol/ga4

### TikTok Events API
- Endpoint: `https://business-api.tiktok.com/open_api/v1.3/pixel/track/`
- Requires: Access Token, Pixel Code, ttclid
- Docs: https://ads.tiktok.com/marketing_api/docs?id=1741601162187777

## Configuration

Settings stored in WordPress options:

### General
- `wab_cookie_name` - Cookie name (default: `wab_a`)
- `wab_cookie_expiry` - Cookie expiry in days (default: 90)
- `wab_cache_ttl` - Server-side attribution cache TTL in hours (default: 48)
- `wab_debug_mode` - Enable debug logging

### Integrations
- `wab_swetrix_enabled` - Enable Swetrix integration
- `wab_swetrix_project_id` - Swetrix project ID
- `wab_swetrix_api_url` - Self-hosted URL (optional)
- `wab_meta_enabled` - Enable Meta CAPI
- `wab_meta_pixel_id` - Meta Pixel ID
- `wab_meta_access_token` - Meta Access Token
- `wab_google_enabled` - Enable Google Ads
- `wab_google_measurement_id` - GA4 Measurement ID
- `wab_google_api_secret` - GA4 API Secret
- `wab_tiktok_enabled` - Enable TikTok Events API
- `wab_tiktok_pixel_code` - TikTok Pixel Code
- `wab_tiktok_access_token` - TikTok Access Token

## Development

```bash
cd ~/GitHub/woo-attribution-bridge
# Plugin will be in src/ directory
# Symlink to WordPress plugins folder for testing:
ln -s $(pwd)/src /path/to/wordpress/wp-content/plugins/woo-attribution-bridge
```

## Testing

### Running Tests

```bash
cd ~/GitHub/woo-attribution-bridge
composer install
composer test           # Run all tests
composer test:unit      # Run unit tests only
composer test:coverage  # Run with coverage report
```

### Test Requirements

- **Target: 80%+ code coverage**
- PHPUnit 10.x with WordPress test framework
- Mock WooCommerce order objects for conversion tests
- Mock HTTP responses for integration tests

### Test Structure

```
tests/
├── bootstrap.php           # Test bootstrap with WP/WC mocks
├── Unit/
│   ├── CookieTest.php     # Cookie handler tests
│   ├── DeduplicationTest.php
│   ├── QueueTest.php
│   ├── DispatcherTest.php
│   ├── ConversionTest.php
│   └── Integrations/
│       ├── MetaTest.php
│       ├── GoogleAdsTest.php
│       ├── TikTokTest.php
│       └── SwetrixTest.php
└── Integration/            # Full integration tests (optional)
```

## Current Implementation Status

### Completed
- [x] Plugin directory structure
- [x] Main plugin file (woo-attribution-bridge.php)
- [x] Activator (creates DB tables)
- [x] Deactivator
- [x] Loader (hook orchestration)
- [x] Cookie handler (click ID capture, visitor ID, touchpoints)
- [x] Server-side attribution cache (cookie-less fallback)
- [x] Cookie consent integration (CookieYes, CookieBot, Complianz, GDPR)
- [x] Deduplication layer
- [x] Retry queue
- [x] Integration base class
- [x] Meta CAPI integration
- [x] Google Ads integration
- [x] TikTok integration
- [x] Swetrix integration
- [x] Dashboard integration (central WAB dashboard)
- [x] Conversion dispatcher
- [x] Admin settings page
- [x] Unit tests (360 tests, 607 assertions)

### Database Tables
- `wp_wab_queue` - Retry queue for failed API calls
- `wp_wab_log` - Conversion event log
- `wp_wab_touchpoints` - Multi-touch attribution tracking
- `wp_wab_identities` - Cross-device identity graph
- `wp_wab_surveys` - Post-purchase survey responses
- `wp_wab_attribution_cache` - Server-side attribution (cookie-less fallback)

## Related Projects & Research

- **Swetrix**: https://github.com/Swetrix/swetrix (open-source analytics)
- **wetracked.io**: Commercial alternative ($49/mo) - does similar but hosted
- **Triple Whale**: Enterprise attribution ($$$)
- **FinalHit**: What UruShop currently uses for ad platform tracking

## Files

- `docs/RESEARCH.md` - Background research on analytics & attribution tools
- `docs/PLAN.md` - Implementation plan
- `docs/API-REFERENCE.md` - API documentation for each platform
- `src/` - Plugin source code
