# syntax=docker/dockerfile:1

# ------------------------------------------------------------
# Base Image: Debian Bookworm Slim with OpenSSL 3 & SQLite
# ------------------------------------------------------------
FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install system dependencies (OpenSSL 3 for Prisma, SQLite, and curl for healthchecks)
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
# Target: web (Production Next.js Server)
# ------------------------------------------------------------
FROM base AS web
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL="file:/app/db/custom.db"

# Create persistent storage directories
RUN mkdir -p /app/db /app/uploads

# Copy Next.js standalone server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Entrypoint script for WAL mode and volume directory setup
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000 || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]

# ------------------------------------------------------------
# Target: daemon (Telegram Background Sync Worker)
# ------------------------------------------------------------
FROM base AS daemon
WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/db/custom.db"

# Copy installed dependencies and source code needed for tsx execution
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Create persistent storage directories
RUN mkdir -p /app/db /app/uploads

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npx", "tsx", "scripts/telegram-daemon.ts"]
