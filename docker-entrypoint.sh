#!/bin/sh
set -e

# Ensure directories for SQLite database and user uploads exist
mkdir -p /app/db /app/uploads

# If the SQLite database exists, ensure WAL (Write-Ahead Logging) is enabled
# This allows concurrent reads and writes between Next.js and background workers
if [ -f "/app/db/custom.db" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 /app/db/custom.db "PRAGMA journal_mode=WAL;" >/dev/null 2>&1 || true
  fi
fi

exec "$@"
