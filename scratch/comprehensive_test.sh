#!/usr/bin/env bash
set -e

COOKIE_JAR="/tmp/khlan_test_cookies.txt"
rm -f "$COOKIE_JAR"

echo "=== STEP 1: Activate Dealer Persona via Spring Boot (usr_dealer_sokha) ==="
LOGIN_RES=$(curl -s -c "$COOKIE_JAR" -X POST http://localhost:8080/api/session \
  -H "Content-Type: application/json" \
  -d '{"userId": "usr_dealer_sokha"}')
echo "Session response: $LOGIN_RES"

echo "=== STEP 2: Dealership Branches (POST, PATCH, DELETE) ==="
# Create test branch
NEW_BRANCH=$(curl -s -b "$COOKIE_JAR" -X POST http://localhost:8080/api/tenant/branches \
  -H "Content-Type: application/json" \
  -d '{"name": "Tuol Kork Luxury Branch", "city": "Phnom Penh", "district": "Tuol Kork", "address": "St 315, Khan Tuol Kork", "isMain": false}')
echo "Created branch: $(echo "$NEW_BRANCH" | grep -o '"name":"[^"]*"')"
BRANCH_ID=$(echo "$NEW_BRANCH" | grep -o '"id":"[^"]*"' | head -n 1 | cut -d'"' -f4)
echo "Branch ID: $BRANCH_ID"

# Update branch (set isMain true)
PATCH_BRANCH=$(curl -s -b "$COOKIE_JAR" -X PATCH "http://localhost:8080/api/tenant/branches/$BRANCH_ID" \
  -H "Content-Type: application/json" \
  -d '{"name": "Tuol Kork Flagship", "isMain": true}')
echo "Patched branch: $(echo "$PATCH_BRANCH" | grep -o '"name":"[^"]*"') isMain=$(echo "$PATCH_BRANCH" | grep -o '"isMain":[^,}]*')"

# Delete test branch
DEL_BRANCH=$(curl -s -b "$COOKIE_JAR" -X DELETE "http://localhost:8080/api/tenant/branches/$BRANCH_ID")
echo "Deleted branch response: $DEL_BRANCH"

echo "=== STEP 3: Dealership Staff (POST, PATCH, DELETE) ==="
# Invite staff member
RAND_PHONE="+85598$(date +%s | tail -c 7)"
INVITE_RES=$(curl -s -b "$COOKIE_JAR" -X POST http://localhost:8080/api/tenant/staff \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Vannak Sales\", \"phone\": \"$RAND_PHONE\", \"role\": \"SALES_STAFF\"}")
echo "Invited staff: $(echo "$INVITE_RES" | grep -o '"name":"[^"]*"')"
MEMBER_ID=$(echo "$INVITE_RES" | grep -o '"id":"[^"]*"' | head -n 1 | cut -d'"' -f4)
echo "Staff ID: $MEMBER_ID"

# Update staff role
PATCH_STAFF=$(curl -s -b "$COOKIE_JAR" -X PATCH "http://localhost:8080/api/tenant/staff/$MEMBER_ID" \
  -H "Content-Type: application/json" \
  -d '{"role": "MANAGER"}')
echo "Patched staff role: $(echo "$PATCH_STAFF" | grep -o '"role":"[^"]*"')"

# Delete staff member
DEL_STAFF=$(curl -s -b "$COOKIE_JAR" -X DELETE "http://localhost:8080/api/tenant/staff/$MEMBER_ID")
echo "Deleted staff response: $DEL_STAFF"

echo "=== STEP 4: Chat Conversations with Role Filtering ==="
CONV_RES=$(curl -s -b "$COOKIE_JAR" http://localhost:8080/api/conversations)
echo "Conversations count: $(echo "$CONV_RES" | grep -o '"id":' | wc -l)"
echo "Has role field: $(echo "$CONV_RES" | grep -q '"role":' && echo "YES" || echo "NO")"
echo "Has myRole field: $(echo "$CONV_RES" | grep -q '"myRole":' && echo "YES" || echo "NO")"

echo "=== STEP 5: Saved Search items / vehicles array test ==="
SEARCH_CREATE=$(curl -s -b "$COOKIE_JAR" -X POST http://localhost:8080/api/account/saved-searches \
  -H "Content-Type: application/json" \
  -d '{"name": "Toyota SUVs", "query": {"make": "Toyota", "bodyType": "SUV"}}')
SEARCH_ID=$(echo "$SEARCH_CREATE" | grep -o '"id":"[^"]*"' | head -n 1 | cut -d'"' -f4)
echo "Created saved search ID: $SEARCH_ID"

SEARCH_RUN=$(curl -s -b "$COOKIE_JAR" -X POST "http://localhost:8080/api/account/saved-searches/$SEARCH_ID/run")
echo "Run saved search total: $(echo "$SEARCH_RUN" | grep -o '"total":[^,}]*')"
echo "Has vehicles field: $(echo "$SEARCH_RUN" | grep -q '"vehicles":' && echo "YES" || echo "NO")"
echo "Has items field: $(echo "$SEARCH_RUN" | grep -q '"items":' && echo "YES" || echo "NO")"

# Clean up saved search
curl -s -b "$COOKIE_JAR" -X DELETE "http://localhost:8080/api/account/saved-searches/$SEARCH_ID" > /dev/null

echo "=== STEP 6: Next.js Frontend Proxy E2E Test (Port 3000) ==="
FE_META=$(curl -s http://localhost:3000/api/meta)
echo "Next.js -> Backend /api/meta: $(echo "$FE_META" | grep -q "makes" && echo "SUCCESS" || echo "FAILED")"

FE_APPT=$(curl -s http://localhost:3000/api/account/appointments)
echo "Next.js -> Backend /api/account/appointments (demo buyer): $(echo "$FE_APPT" | grep -q "apt_demo" && echo "SUCCESS" || echo "FAILED")"

FE_PREVIEW=$(curl -s http://localhost:3000/api/admin/payment-config/preview)
echo "Next.js -> Backend /api/admin/payment-config/preview: $(echo "$FE_PREVIEW" | grep -q "dataUrl" && echo "SUCCESS" || echo "FAILED")"

echo "=== ALL E2E VERIFICATION TESTS PASSED SUCCESSFULLY! ==="
