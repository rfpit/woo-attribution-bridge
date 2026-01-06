# WooCommerce Attribution Bridge

A complete e-commerce marketing intelligence platform with first-party attribution tracking, multi-platform analytics, and AI-powered optimization.

## Why?

**Problem:** GA4 only captures ~48% of conversions due to ad blockers, cookie consent, and iOS privacy features. Ad platforms receive incomplete data, degrading their optimization algorithms.

**Solution:** First-party click ID capture + server-side conversion tracking that bypasses client-side blockers, combined with a unified dashboard for all your sales channels and marketing platforms.

## Features

### Attribution & Tracking
- **Click ID Capture**: Automatically captures `fbclid`, `gclid`, `ttclid`, `msclkid`, and UTM parameters
- **First-Party Storage**: Stores attribution data in your domain's cookies (90-day persistence)
- **Server-Side Sending**: Sends conversions directly to ad platform APIs (bypasses ad blockers)
- **Multi-Touch Attribution**: First-touch, last-touch, linear, and position-based models
- **Post-Purchase Survey**: Capture attribution data that pixels miss
- **Identity Resolution**: Track customers across devices and sessions

### Supported Platforms

| Platform | Type | Status |
|----------|------|--------|
| Meta/Facebook | Conversions API (CAPI) | Implemented |
| Google Ads | Measurement Protocol | Implemented |
| TikTok | Events API | Implemented |
| Swetrix | Events API | Implemented |

### Sales Channel Connectors

| Platform | Integration | Status |
|----------|-------------|--------|
| WooCommerce | Plugin + REST API | Implemented |
| Shopify | OAuth App | Implemented |
| Amazon | SP-API + Advertising API | Implemented |
| eBay | Browse/Sell APIs | Implemented |
| Etsy | Open API | Implemented |

### Marketing Platform Integrations

| Platform | Type | Status |
|----------|------|--------|
| Klaviyo | Email Marketing | Implemented |
| Postscript | SMS Marketing | Implemented |

### Analytics & Intelligence

- **Cohort Analysis**: Retention tracking by acquisition source
- **LTV Predictions**: Customer lifetime value by channel using RFM scoring
- **Revenue Forecasting**: Time-series forecasting with seasonal decomposition
- **Anomaly Detection**: Automatic alerts for unusual metrics
- **Budget Optimizer**: AI-powered budget allocation recommendations
- **Bid Recommendations**: Platform-specific bid adjustments

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HOSTED DASHBOARD (Next.js)                          │
│                                                                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│   │ Attribution │  │  Analytics  │  │  Marketing  │  │   Budget    │      │
│   │  Dashboard  │  │   Cohorts   │  │ Connections │  │  Optimizer  │      │
│   │             │  │  LTV / RFM  │  │   Klaviyo   │  │     Bid     │      │
│   │             │  │  Forecast   │  │  Postscript │  │   Adjust    │      │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘      │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                              DATA LAYER                                      │
│                                                                             │
│   E-COMMERCE              AD PLATFORMS             MARKETPLACES             │
│   ┌─────────┐            ┌─────────┐             ┌─────────┐               │
│   │WooComm. │◄──REST──►  │  Meta   │             │ Amazon  │               │
│   │ Plugin  │            │ Google  │             │  eBay   │               │
│   └─────────┘            │ TikTok  │             │  Etsy   │               │
│   ┌─────────┐            └─────────┘             └─────────┘               │
│   │ Shopify │◄──OAuth──►                                                    │
│   │   App   │                                                               │
│   └─────────┘                                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Requirements

### WordPress Plugin
- WordPress 6.0+
- WooCommerce 8.0+
- PHP 8.0+
- SSL certificate (HTTPS required)

### Dashboard
- Node.js 18+
- PostgreSQL database (Supabase, Neon, or local)
- npm or pnpm

## Quick Start

See [docs/SETUP.md](docs/SETUP.md) for detailed setup instructions.

### 1. Dashboard Setup

```bash
cd dashboard
npm install
cp .env.example .env
# Edit .env with your database URL and secrets
npm run db:push
npm run dev
```

### 2. WordPress Plugin

```bash
# Symlink to WordPress plugins folder
ln -s /path/to/woo-attribution-bridge/src /path/to/wordpress/wp-content/plugins/woo-attribution-bridge
```

Then activate in WordPress Admin > Plugins.

## Project Structure

```
woo-attribution-bridge/
├── CLAUDE.md                    # AI assistant instructions
├── README.md                    # This file
├── docs/
│   ├── RESEARCH.md              # Background research
│   ├── PLAN.md                  # Implementation plan
│   └── SETUP.md                 # Setup guide
├── src/                         # WordPress plugin
│   ├── woo-attribution-bridge.php
│   ├── includes/
│   │   ├── class-wab-activator.php
│   │   ├── class-wab-cookie.php
│   │   ├── class-wab-conversion.php
│   │   ├── class-wab-dispatcher.php
│   │   ├── class-wab-deduplication.php
│   │   ├── class-wab-queue.php
│   │   ├── class-wab-survey.php
│   │   ├── class-wab-touchpoint-tracker.php
│   │   ├── class-wab-identity-resolver.php
│   │   └── class-wab-rest-api.php
│   ├── integrations/
│   │   ├── class-wab-meta.php
│   │   ├── class-wab-google-ads.php
│   │   ├── class-wab-tiktok.php
│   │   └── class-wab-swetrix.php
│   ├── admin/
│   │   └── views/
│   └── assets/
│       ├── js/
│       └── css/
└── dashboard/                   # Next.js dashboard
    ├── src/
    │   ├── app/                 # App router pages
    │   │   ├── api/             # API routes
    │   │   │   ├── analytics/   # Cohorts, LTV, forecasting
    │   │   │   ├── attribution/ # Attribution data
    │   │   │   ├── marketing/   # Klaviyo, Postscript, optimizer
    │   │   │   └── stores/      # Store management
    │   │   └── dashboard/       # Dashboard pages
    │   ├── components/          # React components
    │   ├── db/                  # Drizzle schema
    │   └── lib/
    │       ├── analytics/       # Cohorts, LTV, forecasting, anomaly
    │       ├── attribution/     # Attribution models
    │       ├── connectors/      # Shopify, Amazon, eBay, Etsy
    │       └── marketing/       # Klaviyo, Postscript, budget optimizer
    ├── drizzle.config.ts
    └── package.json
```

## Documentation

- [Setup Guide](docs/SETUP.md) - Getting started
- [Implementation Plan](docs/PLAN.md) - Full feature roadmap
- [Research & Background](docs/RESEARCH.md) - Why this exists

## Key Metrics

The dashboard provides these metrics (like Triple Whale):

| Category | Metrics |
|----------|---------|
| Revenue | Total, New Customer, Returning, AOV |
| ROAS | Blended, NC-ROAS, MER, POAS |
| Customer | CAC, LTV, LTV:CAC Ratio, Payback Period |
| Attribution | Click-attributed, Survey-attributed, UTM-attributed |

## Comparison with Commercial Tools

| Feature | Attribution Bridge | Triple Whale | Northbeam |
|---------|-------------------|--------------|-----------|
| WooCommerce | Yes | No | No |
| Shopify | Yes | Yes | Yes |
| Amazon/eBay/Etsy | Yes | No | No |
| Server-side CAPI | Yes | Yes | Yes |
| Post-Purchase Survey | Yes | Yes | No |
| Multi-Touch Attribution | Yes | Yes | Yes |
| LTV Predictions | Yes | Yes | Yes |
| Budget Optimizer | Yes | Yes | No |
| Klaviyo/Postscript | Yes | Yes | No |
| Self-Hosted Option | Yes | No | No |
| Open Source | Yes | No | No |
| Price | Free | $129/mo+ | $1000/mo+ |

## Privacy & GDPR

- All data stored in **first-party cookies** on your domain
- Click IDs are **not personal data** (they're ad platform identifiers)
- User data (email, phone) is **hashed before sending** to ad platforms
- No data shared with third parties except conversion events to ad platforms you configure
- Complies with ad platform terms of service for server-side tracking

## Tech Stack

### WordPress Plugin
- PHP 8.0+
- WordPress/WooCommerce APIs
- JavaScript (vanilla)
- MySQL (custom tables)

### Dashboard
- Next.js 15 / React 19 / TypeScript
- PostgreSQL with Drizzle ORM
- NextAuth.js v5 for authentication
- TanStack Query for data fetching
- Tailwind CSS + shadcn/ui
- Recharts for visualization

## Contributing

Contributions welcome! Please read the implementation plan in `docs/PLAN.md` before starting.

## License

GPL v3 (required for WordPress plugins)

## Credits

Built with Claude Code (January 2026).
