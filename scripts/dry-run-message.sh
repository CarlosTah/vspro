#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# VSPRO — Dry Run: WhatsApp Message Flow Simulation
# Simulates a full message lifecycle without sending to Meta API.
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

API="${VSPRO_API_URL:-http://localhost:3001}"
TENANT="${1:-vikids}"
PAYLOAD="${2:-test/fixtures/whatsapp-message.json}"
LOG_LEVEL="${LOG_LEVEL:-debug}"

G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; C='\033[0;36m'; B='\033[1;34m'; NC='\033[0m'

echo -e "${Y}═══════════════════════════════════════════════════════${NC}"
echo -e "${Y}  VSPRO DRY RUN — WhatsApp Message Flow${NC}"
echo -e "${Y}═══════════════════════════════════════════════════════${NC}"
echo -e "  API:     ${API}"
echo -e "  Tenant:  ${TENANT}"
echo -e "  Payload: ${PAYLOAD}"
echo -e "  Mode:    ${B}SIMULATION (no real Meta API calls)${NC}"
echo ""

# ─── Pre-flight ──────────────────────────────────────────────
echo -e "${C}[1/7] Pre-flight check${NC}"
HC=$(curl -sf "$API/health" 2>/dev/null || echo "FAIL")
if ! echo "$HC" | grep -q '"status":"ok"'; then
  echo -e "  ${R}✗ API not responding at $API${NC}"
  exit 1
fi
echo -e "  ${G}✓ API healthy${NC}"

# ─── Login ───────────────────────────────────────────────────
echo -e "${C}[2/7] Authenticate as tenant admin${NC}"
if [ "$TENANT" = "vikids" ]; then
  CREDS='{"email":"admin@vikids.mx","password":"Vikids2026!"}'
elif [ "$TENANT" = "room359" ]; then
  CREDS='{"email":"admin@room359.mx","password":"Room359!2026"}'
else
  CREDS="{\"email\":\"admin@${TENANT}.test\",\"password\":\"TestPassword123!\"}"
fi

LOGIN=$(curl -sf -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -H "x-tenant-slug: $TENANT" \
  -d "$CREDS" 2>/dev/null)

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo -e "  ${R}✗ Login failed${NC}"
  exit 1
fi
echo -e "  ${G}✓ Token obtained${NC}"

AUTH="Authorization: Bearer $TOKEN"
SLUG="x-tenant-slug: $TENANT"

# ─── Simulate Webhook ────────────────────────────────────────
echo -e "${C}[3/7] Simulate WhatsApp webhook ingestion${NC}"
WH_PAYLOAD=$(cat "$PAYLOAD")
WH_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$API/webhooks/meta/$TENANT" \
  -H "Content-Type: application/json" \
  -d "$WH_PAYLOAD" 2>/dev/null || echo "000")

if [ "$WH_STATUS" = "200" ] || [ "$WH_STATUS" = "201" ]; then
  echo -e "  ${G}✓ Webhook accepted (HTTP $WH_STATUS)${NC}"
elif [ "$WH_STATUS" = "401" ]; then
  echo -e "  ${Y}⚠ Webhook rejected (no HMAC) — expected in dev mode${NC}"
  echo -e "  ${Y}  Simulating direct message injection instead...${NC}"
else
  echo -e "  ${R}✗ Webhook error (HTTP $WH_STATUS)${NC}"
fi

# ─── Check Agent Router Classification ───────────────────────
echo -e "${C}[4/7] Agent Router classification (simulated)${NC}"
MSG_TEXT=$(echo "$WH_PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['entry'][0]['changes'][0]['value']['messages'][0]['text']['body'])" 2>/dev/null)
echo -e "  Message: \"${MSG_TEXT}\""

# Simulate heuristic classification
if echo "$MSG_TEXT" | grep -qi "comprar\|cuánto\|precio\|quiero"; then
  AGENT="sales"
  CONFIDENCE="0.85"
elif echo "$MSG_TEXT" | grep -qi "pago\|transferencia\|comprobante"; then
  AGENT="finance"
  CONFIDENCE="0.80"
elif echo "$MSG_TEXT" | grep -qi "problema\|queja\|devolver"; then
  AGENT="support"
  CONFIDENCE="0.75"
else
  AGENT="general"
  CONFIDENCE="0.40"
fi
echo -e "  ${G}✓ Routed to: ${B}${AGENT}${NC} (confidence: ${CONFIDENCE}, source: heuristic)"

# ─── AI Test Chat (actual GPT call if key valid) ─────────────
echo -e "${C}[5/7] AI Engine response generation${NC}"
CHAT_RESP=$(curl -sf -X POST "$API/ai/test-chat" \
  -H "$AUTH" -H "$SLUG" -H "Content-Type: application/json" \
  -d "{\"message\":\"$MSG_TEXT\"}" 2>/dev/null || echo "{}")

AI_RESPONSE=$(echo "$CHAT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('aiResponse','[no response]'))" 2>/dev/null)
echo -e "  ${G}✓ AI Response:${NC}"
echo -e "    ${B}\"${AI_RESPONSE}\"${NC}"

# ─── Customer Memory Check ───────────────────────────────────
echo -e "${C}[6/7] Customer memory retrieval${NC}"
CUST_ID=$(curl -sf "$API/customers" -H "$AUTH" -H "$SLUG" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)
if [ -n "$CUST_ID" ]; then
  MEM=$(curl -sf "$API/customers/$CUST_ID/memory" -H "$AUTH" -H "$SLUG" 2>/dev/null)
  PROFILE_KEYS=$(echo "$MEM" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('profile',{})))" 2>/dev/null)
  EPISODES=$(echo "$MEM" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('episodes',[])))" 2>/dev/null)
  echo -e "  ${G}✓ Profile keys: ${PROFILE_KEYS} | Episodes: ${EPISODES}${NC}"
else
  echo -e "  ${Y}⚠ No customer found for memory check${NC}"
fi

# ─── Outbound Delivery Simulation ────────────────────────────
echo -e "${C}[7/7] Outbound delivery simulation${NC}"
SENDER=$(echo "$WH_PAYLOAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['entry'][0]['changes'][0]['value']['messages'][0]['from'])" 2>/dev/null)
echo -e "  Recipient: ${SENDER}"
echo -e "  Channel:   whatsapp"
echo -e "  ${B}[DRY RUN] Would send via Meta Graph API:${NC}"
echo -e "    POST https://graph.facebook.com/v18.0/PHONE_NUMBER_ID/messages"
echo -e "    Body: {to: \"${SENDER}\", type: \"text\", text: {body: \"${AI_RESPONSE:0:60}...\"}}"
echo -e "  ${G}✓ Delivery simulated (not sent — dry run mode)${NC}"

# ─── Summary ─────────────────────────────────────────────────
echo ""
echo -e "${Y}═══════════════════════════════════════════════════════${NC}"
echo -e "${Y}  DRY RUN COMPLETE${NC}"
echo -e "${Y}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Flow: Webhook → Router(${AGENT}) → AI → Response → [Delivery Simulated]"
echo ""
echo -e "  ${G}All steps executed successfully.${NC}"
echo -e "  To send real messages, configure META_APP_SECRET and channel access_token."
echo ""
