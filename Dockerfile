# syntax=docker/dockerfile:1

# ------------------------------------------------------------
# Base Image: Debian Bookworm Slim with OpenSSL 3 & SQLite
# ------------------------------------------------------------
FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    sqlite3 \
  && rm -rf /var/lib/apt/lists/*

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# ------------------------------------------------------------
# Dependencies Stage
# ------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Copy dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma client
RUN pnpm install --frozen-lockfile
RUN pnpm run db:generate

# ------------------------------------------------------------
# Builder Stage
# ------------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build standalone Next.js application
RUN pnpm run build

# ------------------------------------------------------------
# Target: daemon (Dedicated Telegram Sync Worker for multi-container deployments)
# ------------------------------------------------------------
FROM base AS daemon
WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://khlan:khlan_secret_2026@postgres:5432/khlandb"

# Copy installed dependencies and source code needed for tsx execution
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY db /app/db-template

RUN mkdir -p /app/db /app/uploads

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npx", "tsx", "scripts/telegram-daemon.ts"]

# ------------------------------------------------------------
# Target: web (Production Next.js Server - DEFAULT STAGE FOR RENDER)
# NOTE: This MUST be the final stage in the Dockerfile so that cloud
# platforms like Render build the web server by default without needing --target web.
# ------------------------------------------------------------
FROM base AS web
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL="postgresql://khlan:khlan_secret_2026@postgres:5432/khlandb"

# Create persistent storage directories
RUN mkdir -p /app/db /app/uploads

# Copy dependencies, scripts, and source code (supports embedded background sync & tooling)
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Copy Next.js standalone server and static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Pre-seeded database template for cloud environments (Render, Railway, etc.)
COPY db /app/db-template

# Entrypoint script for WAL mode, volume directory setup, and optional background worker
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:${PORT:-3000} || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
