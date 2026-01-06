# Setup Guide

This guide covers setting up both the WordPress plugin and the hosted dashboard.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Dashboard Setup](#dashboard-setup)
3. [WordPress Plugin Setup](#wordpress-plugin-setup)
4. [Ad Platform Configuration](#ad-platform-configuration)
5. [Marketplace Connections](#marketplace-connections)
6. [Marketing Integrations](#marketing-integrations)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Dashboard Requirements
- Node.js 18+ (LTS recommended)
- PostgreSQL database (Supabase, Neon, or local)
- npm or pnpm

### WordPress Plugin Requirements
- WordPress 6.0+
- WooCommerce 8.0+
- PHP 8.0+
- SSL certificate (HTTPS required for cookies)

---

## Dashboard Setup

### 1. Clone and Install

```bash
cd woo-attribution-bridge/dashboard
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/database

# NextAuth
NEXTAUTH_SECRET=your-32-character-secret-here
NEXTAUTH_URL=http://localhost:3000

# Google OAuth (for user login)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

#### Generating NEXTAUTH_SECRET

```bash
openssl rand -base64 32
```

### 3. Database Setup

Push the schema to your database:

```bash
npm run db:push
```

Or generate and apply migrations:

```bash
npm run db:generate
npm run db:push
```

View your database with Drizzle Studio:

```bash
npm run db:studio
```

### 4. Start Development Server

```bash
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

### 5. Create an Account

1. Navigate to `http://localhost:3000/auth/signup`
2. Register with email/password or Google OAuth
3. You'll be redirected to the dashboard

---

## WordPress Plugin Setup

### 1. Install the Plugin

**Option A: Symlink (Development)**

```bash
ln -s /path/to/woo-attribution-bridge/src /path/to/wordpress/wp-content/plugins/woo-attribution-bridge
```

**Option B: Copy (Production)**

Copy the entire `src/` directory to your WordPress plugins folder and rename it to `woo-attribution-bridge`.

### 2. Activate

1. Go to WordPress Admin > Plugins
2. Find "WooCommerce Attribution Bridge"
3. Click "Activate"

### 3. Configure Settings

Navigate to **WooCommerce > Attribution Bridge** to configure:

#### General Settings
- **Enable Plugin**: Toggle attribution tracking on/off
- **Cookie Expiry**: Days to store click IDs (default: 90)

#### Platform Integrations
Configure each platform you want to track:

**Meta (Facebook) CAPI:**
- Pixel ID
- Access Token (from Events Manager)
- Test Event Code (optional, for testing)

**Google Ads:**
- Measurement ID (GA4)
- API Secret
- Conversion Action ID

**TikTok Events API:**
- Pixel Code
- Access Token

**Swetrix:**
- Project ID
- API URL (if self-hosted)

### 4. Connect to Dashboard

1. In the dashboard, go to **Stores > Add Store**
2. Select "WooCommerce"
3. Enter your WordPress site URL
4. Copy the generated API key
5. In WordPress, go to **Attribution Bridge > API Settings**
6. Paste the API key and save

The dashboard will automatically sync orders and attribution data.

---

## Ad Platform Configuration

### Meta (Facebook) Conversions API

1. Go to [Meta Events Manager](https://business.facebook.com/events_manager)
2. Select your Pixel
3. Click **Settings > Generate Access Token**
4. Copy the Pixel ID and Access Token
5. Enter in WordPress plugin settings

**Recommended Events:**
- Purchase (automatic)
- InitiateCheckout (optional)
- AddToCart (optional)

### Google Ads

1. Go to [Google Analytics](https://analytics.google.com)
2. Admin > Data Streams > Select your stream
3. Copy the **Measurement ID** (G-XXXXXXXX)
4. Measurement Protocol > Create API Secret
5. Enter in WordPress plugin settings

**For Offline Conversions (enhanced):**
1. Google Ads > Tools > Conversions
2. Create or select a conversion action
3. Enable "Enhanced conversions for leads"

### TikTok Events API

1. Go to [TikTok Ads Manager](https://ads.tiktok.com)
2. Assets > Events > Web Events
3. Create or select a Pixel
4. Click **Settings > Generate Access Token**
5. Copy Pixel Code and Access Token
6. Enter in WordPress plugin settings

---

## Marketplace Connections

Connect marketplaces in the dashboard under **Marketplaces**.

### Amazon (SP-API)

1. Register as a developer in [Amazon Seller Central](https://sellercentral.amazon.com)
2. Create an app in Developer Central
3. Request API access for:
   - Orders API
   - Reports API
   - Advertising API (for ad spend)
4. Complete OAuth authorization in dashboard

**Required Permissions:**
- `orders:read`
- `reports:read`

### eBay

1. Go to [eBay Developer Program](https://developer.ebay.com)
2. Create an application
3. Generate production keys
4. Complete OAuth in dashboard

**Required Scopes:**
- `https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly`
- `https://api.ebay.com/oauth/api_scope/sell.analytics.readonly`

### Etsy

1. Go to [Etsy Developer](https://www.etsy.com/developers)
2. Create an application
3. Generate API keys
4. Complete OAuth in dashboard

**Required Scopes:**
- `shops_r`
- `transactions_r`

---

## Marketing Integrations

### Klaviyo

1. Go to Klaviyo > Account > Settings > API Keys
2. Create a Private API Key with:
   - Full access to Profiles
   - Full access to Campaigns
   - Read access to Metrics
3. Enter in dashboard under **Marketing > Connections**

### Postscript

1. Go to Postscript > Settings > API
2. Generate an API key
3. Enter your Shop ID and API key in dashboard

---

## Available Scripts

### Dashboard

```bash
# Development
npm run dev           # Start dev server

# Production
npm run build         # Build for production
npm run start         # Start production server

# Database
npm run db:generate   # Generate migrations
npm run db:push       # Push schema to database
npm run db:studio     # Open Drizzle Studio

# Testing
npm run test          # Run unit tests
npm run test:ui       # Run tests with UI
npm run test:coverage # Generate coverage report
npm run test:e2e      # Run Playwright E2E tests

# Linting
npm run lint          # Run ESLint
```

---

## Deployment

### Docker (Recommended for Self-Hosting)

See [DOCKER.md](./DOCKER.md) for complete Docker deployment instructions.

**Quick Start:**

```bash
# Full stack with PostgreSQL
cp .env.docker.example .env.docker
# Edit .env.docker with your values
docker compose --env-file .env.docker up -d

# Or with external database (Supabase, Neon, etc.)
docker compose -f docker-compose.external-db.yml --env-file .env.docker up -d
```

Pre-built images are available from GitHub Container Registry:
```bash
docker pull ghcr.io/rfpit/woo-attribution-bridge/dashboard:latest
```

### Vercel (Recommended for Serverless)

1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables
4. Deploy

### Self-Hosted

1. Build the dashboard:
   ```bash
   npm run build
   ```

2. Start with PM2 or similar:
   ```bash
   npm run start
   ```

3. Configure reverse proxy (nginx/Caddy) for HTTPS

---

## Troubleshooting

### Common Issues

**"Database connection failed"**
- Check DATABASE_URL format
- Ensure PostgreSQL is running
- Verify credentials and host

**"NEXTAUTH_SECRET missing"**
- Generate a secret: `openssl rand -base64 32`
- Add to `.env` file

**"OAuth redirect error"**
- Verify NEXTAUTH_URL matches your domain
- Check Google OAuth redirect URIs in console

**Click IDs not capturing**
- Ensure HTTPS is enabled
- Check browser console for JavaScript errors
- Verify cookie settings allow first-party cookies

**Conversions not sending**
- Check WP Admin > Attribution Bridge > Queue for failed events
- Verify API credentials are correct
- Test with platform's event testing tools

### Debug Mode

Enable debug logging in WordPress:

```php
// wp-config.php
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
```

Logs will be in `wp-content/debug.log`.

### Support

- GitHub Issues: Report bugs and feature requests
- Documentation: Check `docs/` folder for additional guides

---

## Security Considerations

1. **Never commit `.env` files** - Contains secrets
2. **Use HTTPS everywhere** - Required for secure cookies
3. **Rotate API keys periodically** - Especially after team changes
4. **Monitor failed events** - Could indicate credential issues
5. **Limit API key scopes** - Only request necessary permissions

---

## Next Steps

After setup:

1. **Test Attribution Flow**
   - Click an ad link with `?fbclid=test123`
   - Complete a test order
   - Verify event appears in ad platform

2. **Configure Post-Purchase Survey**
   - Customize questions in WP Admin
   - Add FunnelKit shortcode if using custom thank-you page

3. **Set Up Dashboard Alerts**
   - Configure anomaly detection thresholds
   - Set up email notifications

4. **Connect Team Members**
   - Invite users via dashboard settings
   - Assign appropriate roles
