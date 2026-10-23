# Deployment Guide

## 1. Local Docker Deployment (docker-compose)

| Action | Command |
| :--- | :--- |
| **Start in background** | `docker compose up -d` |
| **Stop all containers** | `docker compose down` |
| **View live logs** | `docker compose logs -f` |
| **View web app logs only** | `docker compose logs -f web` |
| **View daemon logs only** | `docker compose logs -f telegram-daemon` |
| **Rebuild after code edits** | `docker compose up -d --build` |

---

## 2. Deploying to Render (Docker Web Service)

### What Caused the Previous Render Error:
1. **Target Selection**: In a multi-stage Dockerfile without `--target`, Render builds the **last stage**. Previously, the Telegram daemon stage was last, so Render deployed the bot instead of the web server (resulting in `"no open ports detected"`).
2. **Missing Database Tables**: On Render's fresh container, `/app/db/custom.db` was empty (no tables existed, causing `"table main.PlatformSetting does not exist"`).

### How It Has Been Fixed:
1. **Default Target**: `web` is now the final stage in `Dockerfile`, so Render automatically deploys the Next.js web application and binds to Render's port (`10000`).
2. **Automatic DB Initialization**: The baseline database template (`db/custom.db`) is copied into `/app/db-template` in the Docker image. If `/app/db/custom.db` is missing on boot, `docker-entrypoint.sh` automatically initializes it with all 33 cars, 17 users, and settings.
3. **All-in-One Service**: On Render, the web server runs in the foreground, and if `TELEGRAM_BOT_TOKEN` is configured, the Telegram sync daemon automatically runs concurrently in the background of the same container!

### Steps to Deploy on Render:
1. Commit and push the updated files to your GitHub repository:
   ```bash
   git add .
   git commit -m "fix(docker): configure default web target, db template, and render blueprint"
   git push origin main
   ```
2. In your Render Dashboard:
   - Go to your Web Service settings.
   - Click **Manual Deploy** -> **Deploy latest commit** (or trigger a new build).
3. Ensure Environment Variables are set in Render:
   - `DATABASE_URL`: `file:/app/db/custom.db`
   - `TELEGRAM_BOT_TOKEN`: `your_bot_token`
   - `TELEGRAM_GROUP_CHAT_ID`: `-1004489863210`
   - `TELEGRAM_WEBHOOK_SECRET`: `khlan_webhook_secret_2026`
   - `ENABLE_TELEGRAM_DAEMON`: `true`