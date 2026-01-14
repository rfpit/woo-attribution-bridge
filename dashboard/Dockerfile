# syntax=docker/dockerfile:1

# ============================================
# Base stage - shared dependencies
# ============================================
FROM node:20-alpine AS base

# Install dependencies needed for node-gyp and health checks
RUN apk add --no-cache libc6-compat curl

WORKDIR /app

# ============================================
# Dependencies stage - install node modules
# ============================================
FROM base AS deps

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --ignore-scripts

# ============================================
# Builder stage - build the application
# ============================================
FROM base AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time environment variables
# These are placeholders - actual values come from runtime
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build date is embedded in the bundle for version tracking
ARG BUILD_DATE
ENV NEXT_PUBLIC_BUILD_DATE=${BUILD_DATE}

# Build the application with standalone output
RUN npm run build

# ============================================
# Runner stage - production image
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Trust the host header when behind a reverse proxy (required for Auth.js v5)
ENV AUTH_TRUST_HOST=true

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy database migrations and migration script
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/src/db/migrate.ts ./src/db/migrate.ts
COPY --from=builder /app/src/db/schema.ts ./src/db/schema.ts

# Copy tsx for running migrations (production dependency)
COPY --from=builder /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=builder /app/node_modules/get-tsconfig ./node_modules/get-tsconfig
COPY --from=builder /app/node_modules/resolve-pkg-maps ./node_modules/resolve-pkg-maps

# Copy entrypoint script
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

# Set correct permissions
RUN chown -R nextjs:nodejs /app && chmod +x docker-entrypoint.sh

USER nextjs

EXPOSE 3000

# Health check (using wget as it's available in alpine via busybox)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:3000/api/health || exit 1

# Start the application (entrypoint handles optional migrations)
ENTRYPOINT ["./docker-entrypoint.sh"]
