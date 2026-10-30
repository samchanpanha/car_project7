# Deployment Guide

## 1. Local Docker Deployment (docker-compose)

| Action | Command |
| :--- | :--- |
| **Start in background** | `docker compose up -d` |
| **Stop all containers** | `docker compose down` |
| **View live logs** | `docker compose logs -f` |
| **Rebuild after code edits** | `docker compose up -d --build` |

Services:
- PostgreSQL, Redis, MinIO, Nacos, observability, Spring Boot backend (8080), Next.js frontend (3000), NGINX gateway (80).

## 2. Backend Build

`backend/Dockerfile` now builds the Spring Boot fat jar inside Docker. The web frontend no longer runs Prisma directly in production.

## 3. Production Environment

`.env.example` documents every variable. Copy it to `.env` and fill in real
values — `.env` is git-ignored **and** excluded from the Docker build context
(`.dockerignore`), so credentials never reach git or an image layer.

Required:
- `AUTH_SECRET`: **the single most important value.** Signs/verifies the
  `khlan_auth` session cookie on BOTH sides. `docker-compose.yml` feeds the same
  value to the frontend and backend containers via the `x-app-security-env`
  anchor. If they differ, no session cookie verifies and real logins silently
  fail. Generate with `openssl rand -hex 32`.
- `DATABASE_URL` / `SPRING_DATASOURCE_URL`: PostgreSQL connection
- `BACKEND_URL`: Spring Boot base URL for Next.js rewrites (default `http://backend:8080`)
- `CLOUDFLARE_R2_*`: object storage settings
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_GROUP_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`
- `APP_DEMO_MODE=false` (**required** in production). When true, any request may
  impersonate a persona — including `usr_admin` — with no password, via the
  `x-khlan-persona` header. It now defaults to false when unset.
- `CRON_SECRET`: bearer secret for `/api/cron/**`. Unset used to leave the ABA
  reconciliation and subscription-reminder sweeps world-triggerable.
- `CORS_ALLOWED_ORIGINS=https://yourdomain.com`
- `SPRING_REDIS_HOST`, `SPRING_REDIS_PORT` (required only for horizontal scaling/multi-instance realtime delivery)
- `TELEGRAM_LOCAL_POLLING=true`: enables the unified 24/7 Telegram background poller inside Spring Boot (polls every 2s, automatically captures PayWay alerts, reconciles subscriptions, and updates inline approval buttons).
  Do **not** also run the Dockerfile `daemon` target against the same bot token —
  two `getUpdates` pollers on one token fight each other and drop updates.
- **Telegram Bot Privacy Mode**: In [@BotFather](https://t.me/BotFather), send `/setprivacy` → select `@KhLanOfficialBot` → choose **Disable** so Telegram's servers deliver unmentioned group PayWay alerts to the bot.

> `scripts/verify_docker_system.sh` authenticates with `x-khlan-persona: usr_admin`,
> so it needs `APP_DEMO_MODE=true` on a throwaway/demo stack. Its Stage 0 preflight
> warns you if demo mode is off.

## 4. Verification

- `http://localhost/api/health`
- `http://localhost/swagger-ui/index.html`
- `http://localhost/`

## 5. Known build-time network dependencies

Two steps reach the internet during `docker compose build`, so an air-gapped or
proxy-restricted builder will fail:

- `prisma generate` downloads engines from `binaries.prisma.sh`.
- `next/font/google` (Inter + Kantumruy Pro in `src/app/layout.tsx`) fetches font
  CSS from `fonts.googleapis.com` at build time. Self-host via `next/font/local`
  if your build environment has no egress.
