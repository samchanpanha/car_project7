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

Set these in your deployment platform:
- `DATABASE_URL` / `SPRING_DATASOURCE_URL`: PostgreSQL connection
- `BACKEND_URL`: Spring Boot base URL for Next.js rewrites (default `http://backend:8080`)
- `CLOUDFLARE_R2_*`: object storage settings
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_GROUP_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`
- `JWT_SECRET`, `NEXTAUTH_SECRET`
- `APP_DEMO_MODE=false` (required in production to disable demo persona login)
- `CORS_ALLOWED_ORIGINS=https://yourdomain.com`
- `SPRING_REDIS_HOST`, `SPRING_REDIS_PORT` (required only for horizontal scaling/multi-instance realtime delivery)
- `TELEGRAM_LOCAL_POLLING=true`: enables the unified 24/7 Telegram background poller inside Spring Boot (polls every 2s, automatically captures PayWay alerts, reconciles subscriptions, and updates inline approval buttons)
- **Telegram Bot Privacy Mode**: In [@BotFather](https://t.me/BotFather), send `/setprivacy` → select `@KhLanOfficialBot` → choose **Disable** so Telegram's servers deliver unmentioned group PayWay alerts to the bot.

## 4. Verification

- `http://localhost/api/health`
- `http://localhost/swagger-ui/index.html`
- `http://localhost/`