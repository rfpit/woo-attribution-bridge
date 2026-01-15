# DevOps Setup Request: CI/CD Pipeline for WAB

## Overview

We need to configure GitHub Actions to deploy the WooCommerce Attribution Bridge project via WireGuard VPN to internal servers.

**Repository:** `rfpit/woo-attribution-bridge`

---

## 1. WireGuard Configuration

### Generate Keypair for GitHub Actions Runner

On a machine with WireGuard installed, generate a keypair:

```bash
wg genkey | tee github_actions_private.key | wg pubkey > github_actions_public.key
```

### Add Peer to WireGuard Server

Add this peer configuration to your WireGuard server (`/etc/wireguard/wg0.conf`):

```ini
# GitHub Actions Runner
[Peer]
PublicKey = <contents of github_actions_public.key>
AllowedIPs = 10.0.1.100/32
```

Then reload WireGuard:
```bash
sudo wg syncconf wg0 <(wg-quick strip wg0)
```

### Information Needed from DevOps

Please provide:

| Item | Description | Example |
|------|-------------|---------|
| WireGuard Server Endpoint | Public IP and port | `203.0.113.1:51820` |
| WireGuard Server Public Key | Server's public key | `ABC123...` |
| Runner IP Address | IP to assign to GitHub runner | `10.0.1.100/32` |
| Private Key | Generated private key for runner | (from github_actions_private.key) |

---

## 2. SSH Key for Deployment

### Generate Deployment SSH Key

```bash
ssh-keygen -t ed25519 -C "github-actions-wab" -f github_actions_deploy
```

### Authorize on Target Servers

Add the public key to these servers:

| Server | IP | User | Path |
|--------|-----|------|------|
| Dashboard Server | 10.0.1.82 | root | `/root/.ssh/authorized_keys` |
| UruShop Staging | (TBD) | root | `/root/.ssh/authorized_keys` |
| UruShop Production | (TBD) | root | `/root/.ssh/authorized_keys` |

### Information Needed from DevOps

Please provide:

| Item | Description |
|------|-------------|
| SSH Private Key | Contents of `github_actions_deploy` (private key) |
| UruShop Staging IP | Internal WireGuard IP of staging WordPress server |
| UruShop Staging Site | Site folder name (e.g., `staging.urushop.co.uk`) |
| UruShop Production IP | Internal WireGuard IP of production WordPress server |
| UruShop Production Site | Site folder name (e.g., `urushop.co.uk`) |

---

## 3. GitHub Secrets to Configure

Go to: **GitHub → rfpit/woo-attribution-bridge → Settings → Secrets and variables → Actions**

### Required Secrets

| Secret Name | Value Source | Description |
|-------------|--------------|-------------|
| `WG_PRIVATE_KEY` | Generated above | WireGuard private key for runner |
| `WG_ENDPOINT` | DevOps to provide | WireGuard server endpoint |
| `WG_SERVER_PUBLIC_KEY` | DevOps to provide | WireGuard server's public key |
| `WG_RUNNER_ADDRESS` | `10.0.1.100/32` | Runner's WireGuard IP |
| `SSH_PRIVATE_KEY` | Generated above | SSH deployment key |
| `DASHBOARD_HOST` | `10.0.1.82` | Dashboard server IP |
| `WP_STAGING_HOST` | DevOps to provide | WordPress staging server IP |
| `WP_STAGING_SITE` | DevOps to provide | Staging site folder name |
| `WP_PRODUCTION_HOST` | DevOps to provide | WordPress production server IP |
| `WP_PRODUCTION_SITE` | DevOps to provide | Production site folder name |
| `NEXTAUTH_SECRET` | `h0nFwzDoMovrac1Fthc4vV9sq6xKUMcG` | Already configured |
| `POSTGRES_PASSWORD` | `1eKWtu3Oog6jO8B2TnoheyNk` | Already configured |

---

## 4. Already Completed

The following have already been set up:

- [x] GitHub Environments created (`staging`, `production`)
- [x] `develop` branch created and pushed
- [x] Docker compose files copied to server (`/opt/wab/`)
- [x] `.env` file created on server with database credentials
- [x] CI/CD workflow files created in repository

---

## 5. Deployment Flow

Once secrets are configured:

### Staging Deployment
- **Trigger:** Push to `develop` branch
- **Dashboard:** Builds image → pushes to GHCR → deploys to 10.0.1.82:3000
- **WordPress:** rsync plugin files to UruShop staging

### Production Deployment
- **Trigger:** Push to `main` branch (after PR merge)
- **Dashboard:** Builds image → pushes to GHCR → deploys to 10.0.1.82:3001
- **WordPress:** rsync plugin files to UruShop production

---

## 6. Testing Checklist

After secrets are configured, verify:

1. [ ] Push to `develop` → staging deployment succeeds
2. [ ] Dashboard accessible at https://wab-staging.cloud.rfp.onl
3. [ ] WordPress plugin deployed to staging site
4. [ ] Create PR from `develop` to `main`
5. [ ] Merge PR → production deployment succeeds
6. [ ] Dashboard accessible at https://wab.cloud.rfp.onl
7. [ ] WordPress plugin deployed to production site

---

## Contact

For questions about this setup, contact the development team.
