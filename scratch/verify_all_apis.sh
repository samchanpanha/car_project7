#!/usr/bin/env bash
set -e

echo "=== 1. Testing /api/meta ==="
META_RES=$(curl -s http://localhost:8080/api/meta)
echo "Meta status: $(echo "$META_RES" | grep -q "makes" && echo "SUCCESS" || echo "FAILED")"

echo "=== 2. Testing Base64 Media Upload (POST /api/uploads) ==="
# 1x1 transparent PNG data URL
DATA_URL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
UPLOAD_RES=$(curl -s -X POST http://localhost:8080/api/uploads \
  -H "Content-Type: application/json" \
  -d "{\"dataUrl\": \"$DATA_URL\"}")
echo "Upload response: $UPLOAD_RES"
FILE_URL=$(echo "$UPLOAD_RES" | grep -o '/api/uploads/[^"]*')
echo "Uploaded file URL: $FILE_URL"

if [ -n "$FILE_URL" ]; then
  echo "Testing GET $FILE_URL..."
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8080$FILE_URL")
  echo "GET $FILE_URL HTTP code: $HTTP_CODE"
fi

echo "=== 3. Testing Telegram TMA Auth (POST /api/auth/telegram) ==="
TG_RES=$(curl -s -i -X POST http://localhost:8080/api/auth/telegram \
  -H "Content-Type: application/json" \
  -d '{"initData": "user=%7B%22id%22%3A99887766%2C%22first_name%22%3A%22Sophea%22%2C%22last_name%22%3A%22Kh%22%2C%22username%22%3A%22sopheakh%22%7D&auth_date=1700000000&hash=mockhash"}')
echo "$TG_RES" | head -n 15

echo "=== 4. Testing Admin Payment Config (GET & PREVIEW) ==="
ADMIN_CFG=$(curl -s http://localhost:8080/api/admin/payment-config)
echo "Admin Config (accountName): $(echo "$ADMIN_CFG" | grep -o '"accountName":"[^"]*"' || echo "$ADMIN_CFG")"

PREVIEW_RES=$(curl -s http://localhost:8080/api/admin/payment-config/preview)
echo "Admin Preview QR dataUrl length: $(echo "$PREVIEW_RES" | wc -c) bytes"

echo "=== 5. Testing Tenant Payment Config (GET /api/tenant/payments/config) ==="
TENANT_CFG=$(curl -s http://localhost:8080/api/tenant/payments/config)
echo "Tenant Config manual.accountName: $(echo "$TENANT_CFG" | grep -o '"accountName":"[^"]*"' || echo "$TENANT_CFG")"

echo "=== 6. Testing Demo Mode Fallbacks ==="
APPT_RES=$(curl -s http://localhost:8080/api/account/appointments)
echo "Appointments response: $APPT_RES"

PURCH_RES=$(curl -s http://localhost:8080/api/account/purchases)
echo "Purchases response: $PURCH_RES"

FAV_RES=$(curl -s http://localhost:8080/api/favorites)
echo "Favorites response: $FAV_RES"

echo "=== 7. Testing Printable Receipt (GET /api/tenant/payments/{id}/receipt) ==="
# Find an existing payment id or test with pay_
RECEIPT_HTML=$(curl -s http://localhost:8080/api/tenant/payments/pay_test123/receipt || true)
echo "Receipt HTML preview: $(echo "$RECEIPT_HTML" | head -n 5)"

echo "=== ALL BASIC BACKEND CHECKS EXECUTED ==="
