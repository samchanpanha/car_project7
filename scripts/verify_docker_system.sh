#!/bin/bash
# ==============================================================================
# KhLan Comprehensive Docker System Verification Suite
# Tests all 11+ services, port routing (80, 3000, 8080), database, cache,
# storage, proxy pass-through, failover resilience, and observability.
# ==============================================================================
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASSED=0
FAILED=0

log_section() {
  echo -e "\n${BOLD}${CYAN}================================================================${NC}"
  echo -e "${BOLD}${CYAN}  $1${NC}"
  echo -e "${BOLD}${CYAN}================================================================${NC}"
}

assert_status() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" -eq "$expected" ]; then
    echo -e "  [${GREEN}PASS${NC}] $desc (HTTP $actual)"
    PASSED=$((PASSED + 1))
  else
    echo -e "  [${RED}FAIL${NC}] $desc (Expected HTTP $expected, got $actual)"
    FAILED=$((FAILED + 1))
  fi
}

assert_contains() {
  local desc="$1"
  local expected_substring="$2"
  local content="$3"
  if echo "$content" | grep -Fq "$expected_substring"; then
    echo -e "  [${GREEN}PASS${NC}] $desc (Found expected: '$expected_substring')"
    PASSED=$((PASSED + 1))
  else
    echo -e "  [${RED}FAIL${NC}] $desc (Missing: '$expected_substring')"
    FAILED=$((FAILED + 1))
  fi
}

# ------------------------------------------------------------------------------
# Stage 0: Preflight — demo persona authentication
#
# Every admin assertion below authenticates with `x-khlan-persona: usr_admin`.
# That header is only honoured when the backend runs with APP_DEMO_MODE=true
# (DualAuthFilter). Demo mode now FAILS CLOSED when the variable is unset, so
# warn loudly instead of letting ~30 checks report confusing 401/403 failures.
# ------------------------------------------------------------------------------
log_section "Stage 0: Preflight — Demo Persona Authentication"
DEMO_MODE="$(docker compose exec -T backend printenv APP_DEMO_MODE 2>/dev/null || echo "")"
if [ "$DEMO_MODE" = "true" ]; then
  echo -e "  [${GREEN}PASS${NC}] Backend APP_DEMO_MODE=true — persona-header auth is available for these checks."
  PASSED=$((PASSED + 1))
else
  echo -e "  [${YELLOW}WARN${NC}] Backend APP_DEMO_MODE is '${DEMO_MODE:-<unset>}'."
  echo -e "        This suite signs in with 'x-khlan-persona: usr_admin', which the backend"
  echo -e "        only accepts in demo mode. Admin checks below will report 401/403."
  echo -e "        To run this suite against a demo stack:"
  echo -e "          echo 'APP_DEMO_MODE=true' >> .env && docker compose up -d backend"
  echo -e "        (Do NOT enable demo mode on any internet-reachable deployment — it is an"
  echo -e "         unauthenticated admin bypass. Prefer a real session token for prod checks.)"
fi

# ------------------------------------------------------------------------------
# Stage 1: Container Fleet Status
# ------------------------------------------------------------------------------
log_section "Stage 1: Container Fleet Health & Up Status"
CONTAINERS=$(docker compose ps --format "{{.Name}}: {{.Status}}")
echo "$CONTAINERS"
for c in khlan-backend khlan-frontend khlan-nginx khlan-postgres khlan-redis khlan-minio khlan-nacos; do
  if echo "$CONTAINERS" | grep -q "$c"; then
    echo -e "  [${GREEN}PASS${NC}] Container $c is present in compose fleet."
    PASSED=$((PASSED + 1))
  else
    echo -e "  [${RED}FAIL${NC}] Container $c is missing."
    FAILED=$((FAILED + 1))
  fi
done

# ------------------------------------------------------------------------------
# Stage 2: PostgreSQL Health & Database Migrations
# ------------------------------------------------------------------------------
log_section "Stage 2: PostgreSQL 16 & Flyway Database Health"
PG_ISREADY=$(docker compose exec -T postgres pg_isready -U khlan -d khlandb)
assert_contains "Postgres connection is ready" "accepting connections" "$PG_ISREADY"

VEHICLE_COUNT=$(docker compose exec -T postgres psql -U khlan -d khlandb -t -A -c "SELECT count(*) FROM vehicles;" || echo "0")
echo "  Total vehicles in PostgreSQL: $VEHICLE_COUNT"
if [ "$VEHICLE_COUNT" -gt 0 ]; then
  echo -e "  [${GREEN}PASS${NC}] PostgreSQL contains seeded vehicles ($VEHICLE_COUNT items)."
  PASSED=$((PASSED + 1))
else
  echo -e "  [${RED}FAIL${NC}] PostgreSQL has no vehicles."
  FAILED=$((FAILED + 1))
fi

FLYWAY_COUNT=$(docker compose exec -T postgres psql -U khlan -d khlandb -t -A -c "SELECT count(*) FROM flyway_schema_history WHERE success = true;" || echo "0")
echo "  Applied Flyway migrations: $FLYWAY_COUNT"
if [ "$FLYWAY_COUNT" -gt 0 ]; then
  echo -e "  [${GREEN}PASS${NC}] Flyway migrations recorded successfully ($FLYWAY_COUNT migrations)."
  PASSED=$((PASSED + 1))
else
  echo -e "  [${RED}FAIL${NC}] No Flyway migrations found."
  FAILED=$((FAILED + 1))
fi

# ------------------------------------------------------------------------------
# Stage 3: Redis In-Memory Cache
# ------------------------------------------------------------------------------
log_section "Stage 3: Redis 7 Connectivity & Caching"
REDIS_PING=$(docker compose exec -T redis redis-cli ping)
assert_contains "Redis responds to PING" "PONG" "$REDIS_PING"

# ------------------------------------------------------------------------------
# Stage 4: MinIO Object Storage
# ------------------------------------------------------------------------------
log_section "Stage 4: MinIO S3 Object Storage"
MINIO_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/minio/health/live || echo "000")
assert_status "MinIO S3 live probe" 200 "$MINIO_HTTP"

# Cloudflare R2 Storage Status & Diagnostic Ping Check
STORAGE_ADMIN_STATUS=$(curl -s -H "x-khlan-persona: usr_admin" http://localhost:8080/api/admin/storage/status)
assert_contains "Cloudflare R2 reports healthy" '"r2Healthy":true' "$STORAGE_ADMIN_STATUS"
assert_contains "Cloudflare R2 reports public CDN URL" '"r2PublicUrl":' "$STORAGE_ADMIN_STATUS"

STORAGE_TEST_PING=$(curl -s -X POST -H "x-khlan-persona: usr_admin" http://localhost:8080/api/admin/storage/test-connection)
assert_contains "Cloudflare R2 ping test succeeds" '"success":true' "$STORAGE_TEST_PING"

# ------------------------------------------------------------------------------
# Stage 5: Alibaba Nacos Service Discovery
# ------------------------------------------------------------------------------
log_section "Stage 5: Alibaba Nacos 2.4 Service Discovery & Config Center"
NACOS_STATE=$(curl -s http://localhost:8848/nacos/v1/console/server/state || echo "")
assert_contains "Nacos server state is standalone" "standalone" "$NACOS_STATE"

# Check if khlan-backend is registered in Nacos
NACOS_SERVICES=$(curl -s "http://localhost:8848/nacos/v1/ns/instance/list?serviceName=khlan-backend" || echo "")
assert_contains "Nacos has khlan-backend registered" "khlan-backend" "$NACOS_SERVICES"

# Verify Spring Boot Admin Nacos Status & Sync APIs
NACOS_ADMIN_STATUS=$(curl -s -H "x-khlan-persona: usr_admin" http://localhost:8080/api/admin/nacos/status)
assert_contains "Nacos Admin Status reports healthy" '"healthy":true' "$NACOS_ADMIN_STATUS"
assert_contains "Nacos Admin Status lists published configs" '"configs":[' "$NACOS_ADMIN_STATUS"

NACOS_ADMIN_SYNC=$(curl -s -X POST -H "x-khlan-persona: usr_admin" http://localhost:8080/api/admin/nacos/sync)
assert_contains "Nacos Admin Sync publishes configs" '"published":[' "$NACOS_ADMIN_SYNC"

# ------------------------------------------------------------------------------
# Stage 6: Spring Boot Direct APIs (Port 8080)
# ------------------------------------------------------------------------------
log_section "Stage 6: Spring Boot Direct APIs (Port 8080)"

HEALTH_RES=$(curl -s -w "\n%{http_code}" http://localhost:8080/api/health)
HEALTH_CODE=$(echo "$HEALTH_RES" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RES" | sed '$d')
assert_status "Spring Boot GET /api/health" 200 "$HEALTH_CODE"
assert_contains "Health payload contains UP status" "UP" "$HEALTH_BODY"

META_RES=$(curl -s -w "\n%{http_code}" http://localhost:8080/api/meta)
META_CODE=$(echo "$META_RES" | tail -n1)
META_BODY=$(echo "$META_RES" | sed '$d')
assert_status "Spring Boot GET /api/meta" 200 "$META_CODE"
assert_contains "Meta includes makes array" "makes" "$META_BODY"

VEHICLES_RES=$(curl -s -w "\n%{http_code}" "http://localhost:8080/api/vehicles?limit=4")
VEHICLES_CODE=$(echo "$VEHICLES_RES" | tail -n1)
VEHICLES_BODY=$(echo "$VEHICLES_RES" | sed '$d')
assert_status "Spring Boot GET /api/vehicles?limit=4" 200 "$VEHICLES_CODE"
assert_contains "Vehicles response has items list" "items" "$VEHICLES_BODY"

SESSION_RES=$(curl -s -w "\n%{http_code}" http://localhost:8080/api/session)
SESSION_CODE=$(echo "$SESSION_RES" | tail -n1)
assert_status "Spring Boot GET /api/session" 200 "$SESSION_CODE"

ACTUATOR_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/actuator/health)
assert_status "Spring Boot GET /actuator/health" 200 "$ACTUATOR_HEALTH"

ACTUATOR_PROM=$(curl -s --max-time 15 http://localhost:8080/actuator/prometheus)
assert_contains "Actuator exposes Prometheus metrics" "application_ready_time_seconds" "$ACTUATOR_PROM"

# ------------------------------------------------------------------------------
# Stage 7: Next.js Frontend Direct & Proxy (Port 3000)
# ------------------------------------------------------------------------------
log_section "Stage 7: Next.js Frontend Direct & API Proxy (Port 3000)"

FRONTEND_SSR=$(curl -s -w "\n%{http_code}" http://localhost:3000/)
FRONTEND_CODE=$(echo "$FRONTEND_SSR" | tail -n1)
FRONTEND_BODY=$(echo "$FRONTEND_SSR" | sed '$d')
assert_status "Next.js GET / SSR home page" 200 "$FRONTEND_CODE"
assert_contains "Next.js HTML contains KhLan root document" "<html" "$FRONTEND_BODY"

PROXY_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)
assert_status "Next.js Proxy GET /api/health -> Spring Boot" 200 "$PROXY_HEALTH"

PROXY_META=$(curl -s http://localhost:3000/api/meta)
assert_contains "Next.js Proxy GET /api/meta returns valid metadata" "makes" "$PROXY_META"

PROXY_VEHICLES=$(curl -s "http://localhost:3000/api/vehicles?limit=2")
assert_contains "Next.js Proxy GET /api/vehicles returns items" "items" "$PROXY_VEHICLES"

# ------------------------------------------------------------------------------
# Stage 8: Nginx Edge Gateway (Port 80)
# ------------------------------------------------------------------------------
log_section "Stage 8: Nginx Edge Gateway Unified Routing (Port 80)"

GATEWAY_ROOT=$(curl -s -w "\n%{http_code}" http://localhost/)
GATEWAY_ROOT_CODE=$(echo "$GATEWAY_ROOT" | tail -n1)
assert_status "Nginx Gateway GET / (routes to Next.js)" 200 "$GATEWAY_ROOT_CODE"

GATEWAY_API=$(curl -s -w "\n%{http_code}" http://localhost/api/health)
GATEWAY_API_CODE=$(echo "$GATEWAY_API" | tail -n1)
assert_status "Nginx Gateway GET /api/health (routes to Spring Boot)" 200 "$GATEWAY_API_CODE"

GATEWAY_VEHICLES=$(curl -s "http://localhost/api/vehicles?limit=1")
assert_contains "Nginx Gateway GET /api/vehicles contains items" "items" "$GATEWAY_VEHICLES"

# ------------------------------------------------------------------------------
# Stage 9: Dynamic Failover & Automated Recovery Test
# ------------------------------------------------------------------------------
log_section "Stage 9: Dynamic Failover & Self-Healing Verification"

echo "  Testing backend downtime handling..."
docker stop khlan-backend >/dev/null 2>&1

NGINX_DOWN=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health || echo "502")
if [ "$NGINX_DOWN" -eq 502 ] || [ "$NGINX_DOWN" -eq 504 ]; then
  echo -e "  [${GREEN}PASS${NC}] Nginx returns gateway error (HTTP $NGINX_DOWN) when backend is stopped"
  PASSED=$((PASSED + 1))
else
  echo -e "  [${RED}FAIL${NC}] Expected HTTP 502 or 504, got $NGINX_DOWN"
  FAILED=$((FAILED + 1))
fi

echo "  Restarting Spring Boot backend..."
docker start khlan-backend >/dev/null 2>&1

echo "  Waiting for backend healthcheck to recover..."
RECOVERED=false
for i in {1..20}; do
  if curl -fsS http://localhost:8080/api/health >/dev/null 2>&1; then
    RECOVERED=true
    echo "  Backend recovered in approximately $((i * 2)) seconds."
    break
  fi
  sleep 2
done

if [ "$RECOVERED" = true ]; then
  echo -e "  [${GREEN}PASS${NC}] Backend successfully rebooted and recovered."
  PASSED=$((PASSED + 1))
else
  echo -e "  [${RED}FAIL${NC}] Backend failed to recover within 40 seconds."
  FAILED=$((FAILED + 1))
fi

GATEWAY_RECOVERED=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health)
assert_status "Nginx Gateway automatically heals to HTTP 200" 200 "$GATEWAY_RECOVERED"

FRONTEND_RECOVERED=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)
assert_status "Next.js proxy automatically heals to HTTP 200" 200 "$FRONTEND_RECOVERED"

# ------------------------------------------------------------------------------
# Stage 10: Observability Pipeline
# ------------------------------------------------------------------------------
log_section "Stage 10: Observability (Prometheus & Loki)"

PROM_TARGETS=$(curl -s http://localhost:9090/api/v1/targets || echo "")
assert_contains "Prometheus targets include spring-boot" "spring-boot" "$PROM_TARGETS"

LOKI_READY=$(curl -s http://localhost:3100/ready || echo "")
assert_contains "Loki reports ready" "ready" "$LOKI_READY"

# ------------------------------------------------------------------------------
# Stage 11: Telegram Platform & Payment Notification Bot
# ------------------------------------------------------------------------------
log_section "Stage 11: Telegram Platform & Payment Notification Bot"

TG_STATUS=$(curl -s http://localhost/api/admin/telegram -H "x-khlan-persona: usr_admin")
assert_contains "Admin Telegram returns botUsername" "botUsername" "$TG_STATUS"
assert_contains "Admin Telegram reports hasEnvToken:true" '"hasEnvToken":true' "$TG_STATUS"

TG_BOT_TEST=$(curl -s -X POST http://localhost/api/admin/telegram/test -H "x-khlan-persona: usr_admin" -H "Content-Type: application/json" -d '{}')
assert_contains "Telegram Bot connection test passes" '"connected":true' "$TG_BOT_TEST"

TG_PAY_TEST=$(curl -s -X POST http://localhost/api/admin/payment-config/test-telegram -H "x-khlan-persona: usr_admin")
assert_contains "Telegram payment test notification dispatches" '"ok":true' "$TG_PAY_TEST"
assert_contains "Telegram payment test returns messageId" '"messageId":' "$TG_PAY_TEST"

# ------------------------------------------------------------------------------
# Final Summary
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}================================================================${NC}"
echo -e "${BOLD}  Verification Summary: ${GREEN}${PASSED} PASSED${NC}, ${RED}${FAILED} FAILED${NC}"
echo -e "${BOLD}================================================================${NC}"

if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}✓ ALL CHECKS PASSED: KhLan system is stable, decoupled, and fully operational!${NC}\n"
  exit 0
else
  echo -e "${RED}${BOLD}✗ SOME CHECKS FAILED: Review the output above for diagnostics.${NC}\n"
  exit 1
fi
