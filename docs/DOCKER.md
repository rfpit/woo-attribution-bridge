# Docker Deployment Guide

This guide covers deploying the WooCommerce Attribution Bridge dashboard using Docker.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Deployment Options](#deployment-options)
3. [Environment Variables](#environment-variables)
4. [Using Pre-built Images](#using-pre-built-images)
5. [Building Locally](#building-locally)
6. [LXC Container Deployment](#lxc-container-deployment)
7. [Database Migrations](#database-migrations)
8. [Reverse Proxy Setup](#reverse-proxy-setup)
9. [Monitoring & Health Checks](#monitoring--health-checks)
10. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Option 1: Full Stack (with PostgreSQL)

```bash
# Clone the repository
git clone https://github.com/rfpit/woo-attribution-bridge.git
cd woo-attribution-bridge

# Copy and configure environment
cp .env.docker.example .env.docker
nano .env.docker  # Edit with your values

# Start services
docker compose --env-file .env.docker up -d

# View logs
docker compose logs -f
```

### Option 2: External Database (Supabase, Neon, etc.)

```bash
# Copy and configure environment
cp .env.docker.example .env.docker
nano .env.docker  # Set DATABASE_URL to your external database

# Start dashboard only
docker compose -f docker-compose.external-db.yml --env-file .env.docker up -d
```

---

## Deployment Options

### Full Stack (`docker-compose.yml`)

Includes:
- PostgreSQL 16 database
- Next.js dashboard
- Persistent volume for database

Best for:
- Self-hosted deployments
- Development environments
- Single-server setups

### External Database (`docker-compose.external-db.yml`)

Includes:
- Next.js dashboard only

Best for:
- Cloud database providers (Supabase, Neon, RDS)
- Existing PostgreSQL infrastructure
- High-availability setups

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXTAUTH_SECRET` | 32+ character secret for session encryption | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Public URL of your dashboard | `https://dashboard.example.com` |

### Database Variables

**For Full Stack (docker-compose.yml):**

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_USER` | PostgreSQL username | `wab` |
| `POSTGRES_PASSWORD` | PostgreSQL password | *required* |
| `POSTGRES_DB` | Database name | `wab_dashboard` |
| `POSTGRES_PORT` | Exposed port | `5432` |

**For External Database (docker-compose.external-db.yml):**

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Full PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | - |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | - |
| `DASHBOARD_PORT` | Port to expose dashboard | `3000` |

### Generating Secrets

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate POSTGRES_PASSWORD
openssl rand -base64 24
```

---

## Using Pre-built Images

Images are automatically built and pushed to GitHub Container Registry.

### Pull the Latest Image

```bash
docker pull ghcr.io/rfpit/woo-attribution-bridge/dashboard:latest
```

### Available Tags

| Tag | Description |
|-----|-------------|
| `latest` | Latest stable release from main branch |
| `v1.0.0` | Specific version |
| `sha-abc1234` | Specific commit |
| `main` | Latest from main branch |

### Using Pre-built Image in Compose

Edit your compose file to use the pre-built image:

```yaml
services:
  dashboard:
    image: ghcr.io/rfpit/woo-attribution-bridge/dashboard:latest
    # Remove build: section when using pre-built
```

---

## Building Locally

### Build the Image

```bash
cd dashboard
docker build -t wab-dashboard:local .
```

### Build with Docker Compose

```bash
docker compose build
```

### Multi-platform Build

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t wab-dashboard:local \
  ./dashboard
```

---

## LXC Container Deployment

For deploying in an LXC container running Docker:

### 1. Prepare the LXC Container

```bash
# Create LXC container (Proxmox example)
pct create 100 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
  --hostname wab-dashboard \
  --memory 2048 \
  --cores 2 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp

# Start and enter the container
pct start 100
pct enter 100
```

### 2. Install Docker in LXC

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version
```

### 3. Deploy the Application

```bash
# Create app directory
mkdir -p /opt/wab && cd /opt/wab

# Clone repository (or copy files)
git clone https://github.com/rfpit/woo-attribution-bridge.git .

# Configure environment
cp .env.docker.example .env.docker
nano .env.docker

# Start services
docker compose --env-file .env.docker up -d
```

### 4. Configure LXC for Docker (if needed)

If you encounter permission issues, ensure your LXC config includes:

```conf
# /etc/pve/lxc/100.conf (Proxmox)
features: keyctl=1,nesting=1
```

### 5. Auto-start on Boot

```bash
# Enable Docker service
systemctl enable docker

# Docker Compose services auto-start via restart: unless-stopped
```

---

## Database Migrations

### Initial Setup

After first deployment, run migrations:

```bash
# Using the running container
docker compose exec dashboard npx drizzle-kit push

# Or run a one-off container
docker compose run --rm dashboard npx drizzle-kit push
```

### View Database (Drizzle Studio)

```bash
# Run Drizzle Studio (connects to your database)
docker compose exec dashboard npx drizzle-kit studio
```

Note: Drizzle Studio runs on port 4983 by default. You may need to expose this port or use SSH tunneling.

---

## Reverse Proxy Setup

### Nginx

```nginx
server {
    listen 80;
    server_name dashboard.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dashboard.example.com;

    ssl_certificate /etc/letsencrypt/live/dashboard.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dashboard.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Caddy

```caddyfile
dashboard.example.com {
    reverse_proxy localhost:3000
}
```

### Traefik (Docker Labels)

Add to your `docker-compose.yml`:

```yaml
services:
  dashboard:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.wab.rule=Host(`dashboard.example.com`)"
      - "traefik.http.routers.wab.tls=true"
      - "traefik.http.routers.wab.tls.certresolver=letsencrypt"
      - "traefik.http.services.wab.loadbalancer.server.port=3000"
```

---

## Monitoring & Health Checks

### Health Check Endpoint

The dashboard exposes a health check at `/api/health`:

```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "checks": {
    "database": "ok"
  }
}
```

### Docker Health Status

```bash
# View container health
docker compose ps

# View health check logs
docker inspect --format='{{json .State.Health}}' wab-dashboard | jq
```

### Log Management

```bash
# View all logs
docker compose logs

# Follow logs
docker compose logs -f

# View specific service
docker compose logs dashboard

# Limit output
docker compose logs --tail=100 dashboard
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs for errors
docker compose logs dashboard

# Verify environment variables
docker compose config

# Check if ports are in use
ss -tlnp | grep 3000
```

### Database Connection Failed

```bash
# Test database connectivity (full stack)
docker compose exec postgres pg_isready

# Check PostgreSQL logs
docker compose logs postgres

# Verify DATABASE_URL format
# postgresql://user:password@host:5432/database
```

### Health Check Failing

```bash
# Test health endpoint manually
docker compose exec dashboard curl -f http://localhost:3000/api/health

# Check if the app is actually running
docker compose exec dashboard ps aux
```

### Out of Memory

Increase container memory limits:

```yaml
services:
  dashboard:
    deploy:
      resources:
        limits:
          memory: 1G
```

### Permission Denied (LXC)

Ensure LXC container has proper features enabled:

```bash
# On Proxmox host
pct set 100 -features nesting=1,keyctl=1
pct reboot 100
```

### Image Pull Authentication

For private registries:

```bash
# Login to GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

---

## Updating

### Update to Latest Version

```bash
# Pull latest images
docker compose pull

# Recreate containers
docker compose up -d

# Run any new migrations
docker compose exec dashboard npx drizzle-kit push

# Clean up old images
docker image prune -f
```

### Rollback

```bash
# Stop current version
docker compose down

# Use specific version
docker compose pull ghcr.io/rfpit/woo-attribution-bridge/dashboard:v1.0.0

# Start with previous version
docker compose up -d
```

---

## Backup & Restore

### Backup PostgreSQL Data

```bash
# Backup database
docker compose exec postgres pg_dump -U wab wab_dashboard > backup.sql

# Or backup the entire volume
docker run --rm \
  -v woo-attribution-bridge_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres-backup.tar.gz /data
```

### Restore PostgreSQL Data

```bash
# Restore from SQL dump
cat backup.sql | docker compose exec -T postgres psql -U wab wab_dashboard

# Or restore volume
docker compose down
docker run --rm \
  -v woo-attribution-bridge_postgres_data:/data \
  -v $(pwd):/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/postgres-backup.tar.gz -C /"
docker compose up -d
```
