# Attribution & Analytics Research

This document captures research conducted on January 2026 regarding analytics and attribution solutions for e-commerce.

## The Problem

### GA4 Accuracy Issues

GA4 only captures approximately **48% of conversions** for UruShop. This is due to:

| Blocker | Impact |
|---------|--------|
| Ad blockers | Block GA script entirely (~30-40% of users) |
| Cookie consent banners | Users declining = no tracking |
| iOS Safari ITP | Limits cookie lifetime to 7 days |
| Brave/Firefox | Built-in tracker blocking |
| Private browsing | Cookies cleared on close |

### Two Different Problems

| Problem | Description | Solution Type |
|---------|-------------|---------------|
| **Analytics accuracy** | Understanding YOUR traffic/conversions | Self-hosted, cookieless analytics |
| **Ad platform attribution** | Feeding accurate data back to Meta/Google algorithms | Server-side tracking with click ID persistence |

These require different solutions but can share infrastructure.

---

## Analytics Solutions Researched

### Commercial Attribution Tools (Like Triple Whale)

| Tool | Price | Features |
|------|-------|----------|
| **wetracked.io** | $49-249/mo | Server-side tracking, bypasses ad blockers, WooCommerce integration |
| **Triple Whale** | $$$$ | Enterprise attribution, expensive |
| **Northbeam** | $$$ | ML-based attribution |
| **Hyros** | $$$ | Multi-touch attribution |
| **Rockerbox** | $$$ | Marketing spend centralization |

**wetracked.io** is the most cost-effective for small e-commerce:
- $49/mo for up to 500 orders
- Reports 98% tracking accuracy (vs 60% with pixels alone)
- WooCommerce supported
- Pushes data back to ad platforms

### Open-Source Analytics (GA4 Alternatives)

| Tool | Type | Self-Host | Cookies | Attribution |
|------|------|-----------|---------|-------------|
| **Swetrix** | Analytics + more | Yes | No | UTM only |
| **Plausible** | Simple analytics | Yes | No | UTM only |
| **Umami** | Lightweight analytics | Yes | No | UTM only |
| **Matomo** | Full analytics | Yes | Optional | Basic |
| **PostHog** | Product analytics | Yes | Optional | User journeys |

**Key finding:** None of these open-source tools do full multi-touch attribution with ad platform integration. They track what happens ON your site, but don't push data back to ad platforms.

---

## Swetrix Deep Dive

### Overview

Swetrix is a privacy-focused, open-source, cookieless analytics platform.

- **GitHub**: https://github.com/Swetrix/swetrix
- **License**: AGPLv3
- **Tech Stack**: Nest.js, React, ClickHouse, MySQL, Redis
- **Pricing**: Free (self-hosted) or $19/mo (cloud)

### Features

- Traffic analytics (pages, geo, devices, referrers)
- UTM campaign tracking
- Custom events with metadata
- Session analytics & user flows
- Funnels
- Revenue analytics (v5+, Cloud only)
- A/B testing & feature flags
- Error tracking
- Performance monitoring

### What Swetrix Captures

| Data | Captured | Notes |
|------|----------|-------|
| UTM source | ✅ | `utm_source` param |
| UTM medium | ✅ | `utm_medium` param |
| UTM campaign | ✅ | `utm_campaign` param |
| UTM term/content | ✅ | `utm_term`, `utm_content` |
| Referrer URL | ✅ | HTTP referrer |
| Full page URL | ✅ | Including query params |
| fbclid/gclid/ttclid | ❌ | Not parsed out separately |

### APIs

**Events API (POST)** - Send data IN:
- `POST /log` - Page views
- `POST /log/custom` - Custom events with metadata
- `POST /log/hb` - Heartbeat/session keepalive
- `POST /log/error` - Error tracking

**Statistics API (GET)** - Read data OUT:
- Various endpoints for traffic, sessions, events, funnels
- 600 requests/hour rate limit

### What Swetrix Does NOT Do

- ❌ No webhooks (can't push data to external services)
- ❌ No plugin system
- ❌ No ad platform integrations
- ❌ No click ID persistence (cookieless by design)

### Swetrix + Self-Hosting Benefits

| Setup | Expected Accuracy |
|-------|-------------------|
| GA4 (current) | ~48% |
| Swetrix Cloud | ~60-70% |
| Swetrix Self-hosted + first-party proxy | **80-95%** |

**First-party proxy** means serving the tracking script from your own domain (e.g., `urushop.co.uk/js/t.js` instead of `cdn.swetrix.com/script.js`), which bypasses most ad blockers.

### GDPR Advantages

| Factor | GA4 | Self-Hosted Swetrix |
|--------|-----|---------------------|
| Cookies | Yes → consent required | No → consent may not be needed |
| Data sharing | Google (US company) | Nobody - your server |
| Data location | Google servers | Your server (UK/EU) |
| Third-party | Yes | No |
| IP handling | Anonymized (but Google) | Anonymized, never leaves infra |

Self-hosted, cookieless analytics with anonymized IPs may operate under **legitimate interest** without explicit consent.

---

## The Attribution Gap

### Click IDs Explained

Ad platforms append click IDs to URLs when users click ads:

| Platform | Parameter | Example |
|----------|-----------|---------|
| Meta/Facebook | `fbclid` | `?fbclid=IwAR3x...` |
| Google Ads | `gclid` | `?gclid=Cj0KCQ...` |
| TikTok | `ttclid` | `?ttclid=E.C.P...` |
| Microsoft | `msclkid` | `?msclkid=abc123` |

### Why Click IDs Matter

To send accurate conversions back to ad platforms, you need the original click ID:

```
1. User clicks Meta ad → arrives with ?fbclid=ABC123
2. User browses, leaves
3. User returns 3 days later (no fbclid in URL)
4. User purchases
5. You send conversion to Meta CAPI with fbclid=ABC123
6. Meta attributes the sale to the original ad click
```

Without the stored click ID, Meta can't attribute the conversion.

### The Storage Problem

Swetrix is **cookieless by design**, meaning it can't persist click IDs across sessions. This is a fundamental architectural choice for privacy.

**Solution:** Store click IDs separately in a first-party cookie (outside Swetrix), then retrieve them at conversion time.

---

## Proposed Solution: Attribution Bridge

A WooCommerce plugin that bridges the gap:

### Data Flow

```
User arrives with click IDs
    ↓
Frontend JS: Store in first-party cookie
    ↓
User converts
    ↓
WooCommerce hook: Retrieve click IDs
    ↓
Server-side: Send to all destinations
    ├─→ Swetrix (analytics)
    ├─→ Meta CAPI (with fbclid)
    ├─→ Google Ads API (with gclid)
    └─→ TikTok Events API (with ttclid)
```

### Why This Works

1. **First-party cookies** survive longer (not blocked like third-party)
2. **Server-side sending** bypasses client-side ad blockers
3. **Single source of truth** - one system handles all attribution
4. **Self-hosted** - full control, GDPR compliant

### Click IDs to Capture

| Param | Platform | Store In Cookie |
|-------|----------|-----------------|
| `fbclid` | Meta/Facebook | Yes |
| `gclid` | Google Ads | Yes |
| `ttclid` | TikTok | Yes |
| `msclkid` | Microsoft | Yes |
| `utm_source` | All | Yes |
| `utm_medium` | All | Yes |
| `utm_campaign` | All | Yes |
| `li_fat_id` | LinkedIn | Optional |
| `twclid` | Twitter/X | Optional |

### Cookie Strategy

```javascript
// Cookie: wab_attribution
{
  "fbclid": "IwAR3x...",
  "gclid": "Cj0KCQ...",
  "ttclid": "E.C.P...",
  "utm_source": "facebook",
  "utm_medium": "cpc",
  "utm_campaign": "winter_sale",
  "first_touch": "2026-01-06T12:00:00Z",
  "last_touch": "2026-01-08T15:30:00Z"
}

// Settings:
// - Domain: .urushop.co.uk (first-party)
// - Expiry: 90 days
// - HttpOnly: false (needs JS access)
// - Secure: true
// - SameSite: Lax
```

---

## API Reference Summary

### Meta Conversions API (CAPI)

```
POST https://graph.facebook.com/v18.0/{pixel_id}/events
Authorization: Bearer {access_token}

{
  "data": [{
    "event_name": "Purchase",
    "event_time": 1704556800,
    "action_source": "website",
    "event_source_url": "https://urushop.co.uk/checkout/order-received/123/",
    "user_data": {
      "em": ["hashed_email"],
      "ph": ["hashed_phone"],
      "fn": ["hashed_firstname"],
      "ln": ["hashed_lastname"],
      "fbclid": "IwAR3x...",
      "client_ip_address": "1.2.3.4",
      "client_user_agent": "Mozilla/5.0..."
    },
    "custom_data": {
      "currency": "GBP",
      "value": 45.99,
      "order_id": "12345"
    }
  }]
}
```

### Google Ads Measurement Protocol (GA4)

```
POST https://www.google-analytics.com/mp/collect
    ?measurement_id=G-XXXXXXXX
    &api_secret=your_api_secret

{
  "client_id": "stored_client_id",
  "events": [{
    "name": "purchase",
    "params": {
      "transaction_id": "12345",
      "value": 45.99,
      "currency": "GBP",
      "items": [...]
    }
  }]
}
```

For offline conversion import with gclid, use Google Ads API.

### TikTok Events API

```
POST https://business-api.tiktok.com/open_api/v1.3/pixel/track/
Access-Token: {access_token}

{
  "pixel_code": "XXXXXXXXX",
  "event": "CompletePayment",
  "timestamp": "2026-01-06T12:00:00Z",
  "context": {
    "user_agent": "Mozilla/5.0...",
    "ip": "1.2.3.4"
  },
  "properties": {
    "content_type": "product",
    "currency": "GBP",
    "value": 45.99,
    "order_id": "12345"
  },
  "ttclid": "E.C.P..."
}
```

### Swetrix Events API

```
POST https://api.swetrix.com/log/custom
X-Client-IP-Address: 1.2.3.4
User-Agent: Mozilla/5.0...

{
  "pid": "your_project_id",
  "ev": "purchase",
  "meta": {
    "order_id": "12345",
    "value": 45.99,
    "currency": "GBP",
    "source": "facebook",
    "medium": "cpc",
    "campaign": "winter_sale"
  }
}
```

---

## Existing Solutions Comparison

| Feature | wetracked.io | Our Plugin |
|---------|--------------|------------|
| Click ID capture | ✅ | ✅ |
| First-party storage | ✅ | ✅ |
| Meta CAPI | ✅ | ✅ |
| Google Ads | ✅ | ✅ |
| TikTok | ✅ | ✅ |
| Self-hosted analytics | ❌ | ✅ (Swetrix) |
| Open source | ❌ | ✅ |
| Self-hosted | ❌ | ✅ |
| Price | $49-249/mo | Free |
| Setup effort | Low | Medium |

---

## Recommendations

### For UruShop Specifically

1. **Short term**: Continue with FinalHit for ad platform attribution
2. **Medium term**: Set up self-hosted Swetrix for analytics (replace GA4)
3. **Long term**: Build Attribution Bridge plugin to unify everything

### Implementation Priority

1. Self-hosted Swetrix (quick win for analytics accuracy)
2. Click ID capture & storage (frontend JS)
3. WooCommerce conversion hook
4. Meta CAPI integration
5. Google Ads integration
6. TikTok integration
7. Admin UI for configuration

---

*Research conducted: January 2026*
*Last updated: January 2026*
