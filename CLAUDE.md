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
- **Extensible**: Easy to add new destination platforms

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

### In Progress
- [ ] Deduplication layer
- [ ] Retry queue
- [ ] Integration base class
- [ ] Meta CAPI integration
- [ ] Google Ads integration
- [ ] TikTok integration
- [ ] Swetrix integration
- [ ] Conversion dispatcher
- [ ] Admin settings page
- [ ] Unit tests (targeting 80%+)

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
