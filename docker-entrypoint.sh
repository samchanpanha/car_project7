#!/bin/sh
set -e

# KhLan Web Application Entrypoint
echo "[KhLan Frontend] Starting Next.js web application connected to Spring Boot backend (${BACKEND_URL:-http://backend:8080})..."
exec "$@"
