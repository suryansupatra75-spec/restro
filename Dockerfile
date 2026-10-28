# ==============================================================================
# RESTAURANT SAAS — PRODUCTION MULTI-STAGE DOCKERFILE
# ==============================================================================
# Architecture:
# - Stage 1 (base): Alpine Node.js runtime with libc6-compat for Prisma engine
# - Stage 2 (deps): Clean dependency installation with npm cache mounting
# - Stage 3 (builder): Prisma client generation and Next.js standalone compilation
# - Stage 4 (runner): Minimal non-root production container (UID/GID 1001)
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Base Runtime Image
# ------------------------------------------------------------------------------
FROM node:20-alpine AS base

# Install libc6-compat for Alpine compatibility with Prisma binary engines
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ------------------------------------------------------------------------------
# 2. Dependencies Installation
# ------------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install exact production & build dependencies cleanly
RUN npm ci

# ------------------------------------------------------------------------------
# 3. Source Build Stage
# ------------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js with standalone output enabled
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV BUILD_STANDALONE=true

RUN npm run build

# ------------------------------------------------------------------------------
# 4. Minimal Production Runner
# ------------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Enforce non-root execution: create unprivileged system user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Create persistent storage directories with correct permissions
RUN mkdir -p /app/prisma /app/backups && \
    chown -R nextjs:nodejs /app/prisma /app/backups

# Copy public assets and static bundle
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema and engine assets
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Switch to unprivileged runtime user
USER nextjs

# Expose default application port
EXPOSE 3000

# Native container healthcheck querying the liveness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Start the optimized Next.js standalone HTTP server
CMD ["node", "server.js"]
