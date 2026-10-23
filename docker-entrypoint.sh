#!/bin/sh
set -e

# Ensure directories for SQLite database and user uploads exist
mkdir -p /app/db /app/uploads

# If SQLite database does not exist in /app/db, initialize from baseline template
if [ ! -f "/app/db/custom.db" ]; then
  if [ -f "/app/db-template/custom.db" ]; then
    echo "[Entrypoint] Initializing database from baseline template..."
    cp /app/db-template/custom.db /app/db/custom.db
    echo "[Entrypoint] Database initialized successfully."
  fi
fi

# Enable SQLite WAL (Write-Ahead Logging) mode for high-concurrency access
if [ -f "/app/db/custom.db" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 /app/db/custom.db "PRAGMA journal_mode=WAL;" >/dev/null 2>&1 || true
  fi
fi

# If running the web server and TELEGRAM_BOT_TOKEN is set, start the daemon in the background
# (This allows single-service deployments like Render Web Service to run both the web app and bot)
if [ "$1" = "node" ] && [ "$2" = "server.js" ]; then
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ "$ENABLE_TELEGRAM_DAEMON" != "false" ]; then
    if [ -f "/app/scripts/telegram-daemon.ts" ]; then
      echo "[Entrypoint] Starting Telegram sync daemon in background..."
      (npx tsx scripts/telegram-daemon.ts 2>&1 | sed 's/^/[tg-daemon] /') &
    fi
  fi
fi

exec "$@"
