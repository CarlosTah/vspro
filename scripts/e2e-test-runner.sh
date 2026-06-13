#!/bin/bash
# VSPRO E2E Test Runner
# Ejecuta todas las pruebas contra la API local

API="http://localhost:3001"
PASS=0
FAIL=0
RESULTS=""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_result() {
  local section="$1" test_name="$2" expected="$3" actual="$4" status="$5" notes="$6"
  if [ "$status" = "PASS" ]; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} $test_name"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} $test_name — $notes"
  fi
  RESULTS="${RESULTS}| ${section} | ${test_name} | ${expected} | ${status} | ${notes} |\n"
}

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  VSPRO E2E TEST SUITE${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo ""

# ─── 1. HEALTH ───────────────────────────────────────────
echo -e "${YELLOW}[1] HEALTH & INFRAESTRUCTURA${NC}"

R=$(curl -s $API/health)
if echo "$R" | grep -q '"status":"ok"'; then
  log_result "1" "Health check" "status:ok" "ok" "PASS" ""
else
  log_result "1" "Health check" "status:ok" "$R" "FAIL" "API no responde"
fi

R=$(curl -s -o /dev/null -w "%{http_code}" $API/docs)
if [ "$R" = "200" ]; then
  log_result "1" "Swagger docs" "200" "$R" "PASS" ""
else
  log_result "1" "Swagger docs" "200" "$R" "FAIL" "HTTP $R"
fi

echo ""
# ─── 2. AUTH ─────────────────────────────────────────────
echo -e "${YELLOW}[2] AUTENTICACIÓN${NC}"

# Login vikids
R=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" -H "x-tenant-slug: vikids" -d '{"email":"admin@vikids.mx","password":"Vikids2026!"}')
VIKIDS_TOKEN=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
if [ -n "$VIKIDS_TOKEN" ] && [ "$VIKIDS_TOKEN" != "" ]; then
  log_result "2" "Login vikids" "token" "token" "PASS" ""
else
  log_result "2" "Login vikids" "token" "no token" "FAIL" "$R"
fi

# Login room359
R=$(curl -s -X POST $API/auth/login -H "Content-Type: application/json" -H "x-tenant-slug: room359" -d '{"email":"admin@room359.mx","password":"Room359!2026"}')
ROOM_TOKEN=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
if [ -n "$ROOM_TOKEN" ] && [ "$ROOM_TOKEN" != "" ]; then
  log_result "2" "Login room359" "token" "token" "PASS" ""
else
  log_result "2" "Login room359" "token" "no token" "FAIL" "$R"
fi

# Login password incorrecto
R=$(curl -s -o /dev/null -w "%{http_code}" -X POST $API/auth/login -H "Content-Type: application/json" -H "x-tenant-slug: vikids" -d '{"email":"admin@vikids.mx","password":"wrong"}')
if [ "$R" = "401" ]; then
  log_result "2" "Login password incorrecto" "401" "$R" "PASS" ""
else
  log_result "2" "Login password incorrecto" "401" "$R" "FAIL" "HTTP $R"
fi

# Acceso sin token
R=$(curl -s -o /dev/null -w "%{http_code}" $API/products -H "x-tenant-slug: vikids")
if [ "$R" = "401" ]; then
  log_result "2" "Acceso sin token" "401" "$R" "PASS" ""
else
  log_result "2" "Acceso sin token" "401" "$R" "FAIL" "HTTP $R"
fi

# Cross-tenant token
R=$(curl -s -o /dev/null -w "%{http_code}" $API/products -H "Authorization: Bearer $VIKIDS_TOKEN" -H "x-tenant-slug: room359")
if [ "$R" = "401" ]; then
  log_result "2" "Cross-tenant token bloqueado" "401" "$R" "PASS" ""
else
  log_result "2" "Cross-tenant token bloqueado" "401" "$R" "FAIL" "HTTP $R — aislamiento roto"
fi

echo ""
# ─── 3. PRODUCTOS (vikids) ───────────────────────────────
echo -e "${YELLOW}[3] PRODUCTOS (vikids)${NC}"
AUTH_V="Authorization: Bearer $VIKIDS_TOKEN"
TENANT_V="x-tenant-slug: vikids"

# Listar
R=$(curl -s $API/products -H "$AUTH_V" -H "$TENANT_V")
COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('data',[])))" 2>/dev/null)
if [ "$COUNT" -ge "1" ] 2>/dev/null; then
  log_result "3" "Listar productos" ">=1" "$COUNT" "PASS" "$COUNT productos"
else
  log_result "3" "Listar productos" ">=1" "$COUNT" "FAIL" "$R"
fi

# Buscar
R=$(curl -s "$API/products/search?q=vestido" -H "$AUTH_V" -H "$TENANT_V")
SCOUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('data',[])))" 2>/dev/null)
if [ "$SCOUNT" -ge "1" ] 2>/dev/null; then
  log_result "3" "Buscar 'vestido'" ">=1" "$SCOUNT" "PASS" ""
else
  log_result "3" "Buscar 'vestido'" ">=1" "$SCOUNT" "FAIL" "$(echo $R | head -c 100)"
fi

# Detalle primer producto
PROD_ID=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d if isinstance(d,list) else d.get('data',[]))[0]['id'])" 2>/dev/null)
if [ -z "$PROD_ID" ]; then
  PROD_ID=$(curl -s $API/products -H "$AUTH_V" -H "$TENANT_V" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)
fi
R=$(curl -s "$API/products/$PROD_ID" -H "$AUTH_V" -H "$TENANT_V")
HAS_NAME=$(echo "$R" | python3 -c "import sys,json; print('yes' if json.load(sys.stdin).get('name') else 'no')" 2>/dev/null)
if [ "$HAS_NAME" = "yes" ]; then
  log_result "3" "Detalle producto" "name present" "yes" "PASS" ""
else
  log_result "3" "Detalle producto" "name present" "$HAS_NAME" "FAIL" "$(echo $R | head -c 100)"
fi

# Crear producto
R=$(curl -s -X POST $API/products -H "$AUTH_V" -H "$TENANT_V" -H "Content-Type: application/json" -d '{"name":"Test Product","sku":"TEST-001","price":99.99,"category":"Test"}')
HTTP=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') or d.get('statusCode',''))" 2>/dev/null)
if [ -n "$HTTP" ] && echo "$HTTP" | grep -qv "^4"; then
  NEW_PROD_ID="$HTTP"
  log_result "3" "Crear producto" "201/id" "$HTTP" "PASS" ""
else
  log_result "3" "Crear producto" "201/id" "$HTTP" "FAIL" "$(echo $R | head -c 150)"
fi

# Variantes
R=$(curl -s "$API/products/$PROD_ID/variants" -H "$AUTH_V" -H "$TENANT_V")
VCOUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null)
if [ "$VCOUNT" -ge "0" ] 2>/dev/null; then
  log_result "3" "Listar variantes" "array" "$VCOUNT variants" "PASS" ""
else
  log_result "3" "Listar variantes" "array" "error" "FAIL" "$(echo $R | head -c 100)"
fi

echo ""
# ─── 4. PRODUCTOS (room359) ──────────────────────────────
echo -e "${YELLOW}[4] PROPIEDADES (room359)${NC}"
AUTH_R="Authorization: Bearer $ROOM_TOKEN"
TENANT_R="x-tenant-slug: room359"

R=$(curl -s $API/products -H "$AUTH_R" -H "$TENANT_R")
COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else len(d.get('data',[])))" 2>/dev/null)
if [ "$COUNT" -ge "1" ] 2>/dev/null; then
  log_result "4" "Listar propiedades" ">=1" "$COUNT" "PASS" "$COUNT propiedades"
else
  log_result "4" "Listar propiedades" ">=1" "$COUNT" "FAIL" ""
fi

ROOM_PROD_ID=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d if isinstance(d,list) else d.get('data',[]))[0]['id'])" 2>/dev/null)

echo ""
# ─── 5. CLIENTES ─────────────────────────────────────────
echo -e "${YELLOW}[5] CLIENTES${NC}"

R=$(curl -s $API/customers -H "$AUTH_V" -H "$TENANT_V")
COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null)
if [ "$COUNT" -ge "1" ] 2>/dev/null; then
  log_result "5" "Clientes vikids" ">=1" "$COUNT" "PASS" "$COUNT clientes"
else
  log_result "5" "Clientes vikids" ">=1" "$COUNT" "FAIL" ""
fi

CUST_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)

R=$(curl -s $API/customers -H "$AUTH_R" -H "$TENANT_R")
COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null)
if [ "$COUNT" -ge "1" ] 2>/dev/null; then
  log_result "5" "Clientes room359" ">=1" "$COUNT" "PASS" "$COUNT clientes"
else
  log_result "5" "Clientes room359" ">=1" "$COUNT" "FAIL" ""
fi

# Detalle cliente
R=$(curl -s "$API/customers/$CUST_ID" -H "$AUTH_V" -H "$TENANT_V")
HAS=$(echo "$R" | python3 -c "import sys,json; print('yes' if json.load(sys.stdin).get('name') else 'no')" 2>/dev/null)
if [ "$HAS" = "yes" ]; then
  log_result "5" "Detalle cliente" "name" "yes" "PASS" ""
else
  log_result "5" "Detalle cliente" "name" "$HAS" "FAIL" "$(echo $R | head -c 100)"
fi

# Crear cliente
R=$(curl -s -X POST $API/customers -H "$AUTH_V" -H "$TENANT_V" -H "Content-Type: application/json" -d '{"name":"Test Client","phone":"5215500000000","channelType":"whatsapp","channelId":"5215500000000"}')
NEW_CUST=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$NEW_CUST" ]; then
  log_result "5" "Crear cliente" "id" "$NEW_CUST" "PASS" ""
else
  log_result "5" "Crear cliente" "id" "error" "FAIL" "$(echo $R | head -c 150)"
fi

echo ""
# ─── 6. PEDIDOS (vikids) ─────────────────────────────────
echo -e "${YELLOW}[6] PEDIDOS (vikids)${NC}"

R=$(curl -s $API/orders -H "$AUTH_V" -H "$TENANT_V")
COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null)
if [ "$COUNT" -ge "1" ] 2>/dev/null; then
  log_result "6" "Listar pedidos" ">=1" "$COUNT" "PASS" "$COUNT pedidos"
else
  log_result "6" "Listar pedidos" ">=1" "$COUNT" "FAIL" ""
fi

ORDER_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)

# Detalle
R=$(curl -s "$API/orders/$ORDER_ID" -H "$AUTH_V" -H "$TENANT_V")
HAS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('id') else 'no')" 2>/dev/null)
if [ "$HAS" = "yes" ]; then
  log_result "6" "Detalle pedido" "id" "yes" "PASS" ""
else
  log_result "6" "Detalle pedido" "id" "$HAS" "FAIL" "$(echo $R | head -c 100)"
fi

# Crear pedido
R=$(curl -s -X POST $API/orders -H "$AUTH_V" -H "$TENANT_V" -H "Content-Type: application/json" -d "{\"customerId\":\"$CUST_ID\",\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":299}]}")
NEW_ORDER=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') or d.get('statusCode',''))" 2>/dev/null)
if [ -n "$NEW_ORDER" ] && echo "$NEW_ORDER" | grep -qv "^4"; then
  log_result "6" "Crear pedido" "id" "created" "PASS" ""
else
  log_result "6" "Crear pedido" "id" "error" "FAIL" "$(echo $R | head -c 150)"
fi

echo ""
# ─── 7. RENTAL (room359) ─────────────────────────────────
echo -e "${YELLOW}[7] RENTAL (room359)${NC}"

# Check availability
R=$(curl -s -X POST $API/rental/check-availability -H "$AUTH_R" -H "$TENANT_R" -H "Content-Type: application/json" -d "{\"productId\":\"$ROOM_PROD_ID\",\"checkIn\":\"2026-07-01\",\"checkOut\":\"2026-07-05\"}")
AVAIL=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('available',''))" 2>/dev/null)
if [ "$AVAIL" = "True" ] || [ "$AVAIL" = "true" ]; then
  PRICE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('totalPrice',''))" 2>/dev/null)
  log_result "7" "Check availability (libre)" "available:true" "true" "PASS" "Precio: $PRICE"
else
  log_result "7" "Check availability (libre)" "available:true" "$AVAIL" "FAIL" "$(echo $R | head -c 150)"
fi

# Precio semanal (7 noches)
R=$(curl -s -X POST $API/rental/check-availability -H "$AUTH_R" -H "$TENANT_R" -H "Content-Type: application/json" -d "{\"productId\":\"$ROOM_PROD_ID\",\"checkIn\":\"2026-08-01\",\"checkOut\":\"2026-08-08\"}")
PRICE7=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('totalPrice',''))" 2>/dev/null)
if [ -n "$PRICE7" ] && [ "$PRICE7" != "None" ]; then
  log_result "7" "Precio 7 noches" "precio" "$PRICE7" "PASS" ""
else
  log_result "7" "Precio 7 noches" "precio" "error" "FAIL" "$(echo $R | head -c 100)"
fi

# Calendario
R=$(curl -s "$API/rental/calendar/$ROOM_PROD_ID" -H "$AUTH_R" -H "$TENANT_R")
HTTP=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if 'blockedDates' in d or 'calendar' in d or isinstance(d,list) else d.get('statusCode',''))" 2>/dev/null)
if [ "$HTTP" = "ok" ] || echo "$R" | grep -q "block\|calendar\|dates"; then
  log_result "7" "Calendario propiedad" "datos" "ok" "PASS" ""
else
  log_result "7" "Calendario propiedad" "datos" "$HTTP" "FAIL" "$(echo $R | head -c 100)"
fi

# Crear reservación
R=$(curl -s -X POST $API/rental/reservations -H "$AUTH_R" -H "$TENANT_R" -H "Content-Type: application/json" -d "{\"productId\":\"$ROOM_PROD_ID\",\"checkIn\":\"2026-09-01\",\"checkOut\":\"2026-09-04\",\"guestName\":\"Test Guest\",\"guestPhone\":\"5215500001111\"}")
RES_ID=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') or d.get('statusCode',''))" 2>/dev/null)
if [ -n "$RES_ID" ] && echo "$RES_ID" | grep -qv "^4"; then
  log_result "7" "Crear reservación" "id" "created" "PASS" ""
else
  log_result "7" "Crear reservación" "id" "error" "FAIL" "$(echo $R | head -c 150)"
fi

echo ""
# ─── 8. CONVERSACIONES ───────────────────────────────────
echo -e "${YELLOW}[8] CONVERSACIONES${NC}"

R=$(curl -s $API/conversations -H "$AUTH_V" -H "$TENANT_V")
COUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null)
if [ "$COUNT" -ge "1" ] 2>/dev/null; then
  log_result "8" "Listar conversaciones" ">=1" "$COUNT" "PASS" ""
  CONV_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)
  # Mensajes
  R2=$(curl -s "$API/conversations/$CONV_ID/messages" -H "$AUTH_V" -H "$TENANT_V")
  MCOUNT=$(echo "$R2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null)
  if [ "$MCOUNT" -ge "0" ] 2>/dev/null; then
    log_result "8" "Mensajes de conversación" "array" "$MCOUNT msgs" "PASS" ""
  else
    log_result "8" "Mensajes de conversación" "array" "error" "FAIL" "$(echo $R2 | head -c 100)"
  fi
else
  log_result "8" "Listar conversaciones" ">=1" "$COUNT" "FAIL" ""
fi

echo ""
# ─── 9. PAGOS ────────────────────────────────────────────
echo -e "${YELLOW}[9] PAGOS${NC}"

R=$(curl -s "$API/payments/order/$ORDER_ID" -H "$AUTH_V" -H "$TENANT_V")
PSTATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if isinstance(d,list) else d.get('statusCode',''))" 2>/dev/null)
if [ "$PSTATUS" = "ok" ]; then
  log_result "9" "Pagos de pedido" "array" "ok" "PASS" ""
else
  log_result "9" "Pagos de pedido" "array" "$PSTATUS" "FAIL" "$(echo $R | head -c 100)"
fi

echo ""
# ─── 10. PRODUCCIÓN ──────────────────────────────────────
echo -e "${YELLOW}[10] PRODUCCIÓN${NC}"

R=$(curl -s $API/production/queue -H "$AUTH_V" -H "$TENANT_V")
PSTATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if isinstance(d,list) else d.get('statusCode',''))" 2>/dev/null)
if [ "$PSTATUS" = "ok" ]; then
  log_result "10" "Cola producción" "array" "ok" "PASS" ""
else
  log_result "10" "Cola producción" "array" "$PSTATUS" "FAIL" "$(echo $R | head -c 100)"
fi

R=$(curl -s $API/production/stats -H "$AUTH_V" -H "$TENANT_V")
PSTATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if 'inProduction' in d or 'total' in d or 'queue' in d else d.get('statusCode',''))" 2>/dev/null)
if [ "$PSTATUS" = "ok" ]; then
  log_result "10" "Stats producción" "object" "ok" "PASS" ""
else
  log_result "10" "Stats producción" "object" "$PSTATUS" "FAIL" "$(echo $R | head -c 100)"
fi

echo ""
# ─── 11. LOGÍSTICA ───────────────────────────────────────
echo -e "${YELLOW}[11] LOGÍSTICA${NC}"

R=$(curl -s $API/logistics/zones -H "$AUTH_V" -H "$TENANT_V")
ZCOUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else 0)" 2>/dev/null)
if [ "$ZCOUNT" -ge "1" ] 2>/dev/null; then
  log_result "11" "Zonas de envío" ">=1" "$ZCOUNT zonas" "PASS" ""
else
  log_result "11" "Zonas de envío" ">=1" "$ZCOUNT" "FAIL" "$(echo $R | head -c 100)"
fi

R=$(curl -s -X POST $API/logistics/calculate -H "$AUTH_V" -H "$TENANT_V" -H "Content-Type: application/json" -d '{"originZip":"06600","destinationZip":"44100","weightKg":1.5}')
COST=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('cost','') or d.get('total','') or d.get('statusCode',''))" 2>/dev/null)
if [ -n "$COST" ] && echo "$COST" | grep -qv "^4"; then
  log_result "11" "Calcular envío" "costo" "$COST" "PASS" ""
else
  log_result "11" "Calcular envío" "costo" "$COST" "FAIL" "$(echo $R | head -c 100)"
fi

echo ""
# ─── 12. AI / HERRAMIENTAS ───────────────────────────────
echo -e "${YELLOW}[12] AI / HERRAMIENTAS${NC}"

R=$(curl -s $API/ai/config -H "$AUTH_V" -H "$TENANT_V")
ANAME=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('assistantName',''))" 2>/dev/null)
if [ "$ANAME" = "Viki" ]; then
  log_result "12" "AI Config vikids" "Viki" "$ANAME" "PASS" ""
else
  log_result "12" "AI Config vikids" "Viki" "$ANAME" "FAIL" "$(echo $R | head -c 100)"
fi

R=$(curl -s $API/ai/config -H "$AUTH_R" -H "$TENANT_R")
ANAME=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('assistantName',''))" 2>/dev/null)
if [ "$ANAME" = "Luna" ]; then
  log_result "12" "AI Config room359" "Luna" "$ANAME" "PASS" ""
else
  log_result "12" "AI Config room359" "Luna" "$ANAME" "FAIL" "$(echo $R | head -c 100)"
fi

R=$(curl -s $API/ai/tools -H "$AUTH_V" -H "$TENANT_V")
TCOUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ "$TCOUNT" -ge "7" ] 2>/dev/null; then
  log_result "12" "Tools vikids" "7" "$TCOUNT" "PASS" ""
else
  log_result "12" "Tools vikids" "7" "$TCOUNT" "FAIL" ""
fi

R=$(curl -s $API/ai/tools -H "$AUTH_R" -H "$TENANT_R")
TCOUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ "$TCOUNT" -ge "8" ] 2>/dev/null; then
  log_result "12" "Tools room359" "8" "$TCOUNT" "PASS" ""
else
  log_result "12" "Tools room359" "8" "$TCOUNT" "FAIL" ""
fi

echo ""
# ─── 13. BILLING ─────────────────────────────────────────
echo -e "${YELLOW}[13] BILLING${NC}"

R=$(curl -s $API/billing/subscription -H "$AUTH_V" -H "$TENANT_V")
BSTATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('plan') or d.get('status') else d.get('statusCode',''))" 2>/dev/null)
if [ "$BSTATUS" = "ok" ]; then
  log_result "13" "Ver suscripción" "plan" "ok" "PASS" ""
else
  log_result "13" "Ver suscripción" "plan" "$BSTATUS" "FAIL" "$(echo $R | head -c 100)"
fi

R=$(curl -s $API/billing/usage -H "$AUTH_V" -H "$TENANT_V")
BSTATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if isinstance(d,dict) and not d.get('statusCode') else d.get('statusCode',''))" 2>/dev/null)
if [ "$BSTATUS" = "ok" ]; then
  log_result "13" "Ver uso" "metrics" "ok" "PASS" ""
else
  log_result "13" "Ver uso" "metrics" "$BSTATUS" "FAIL" "$(echo $R | head -c 100)"
fi

echo ""
# ─── 14. ENVÍOS ──────────────────────────────────────────
echo -e "${YELLOW}[14] ENVÍOS${NC}"

R=$(curl -s "$API/shipments/order/$ORDER_ID" -H "$AUTH_V" -H "$TENANT_V")
SSTATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if isinstance(d,list) else d.get('statusCode',''))" 2>/dev/null)
if [ "$SSTATUS" = "ok" ]; then
  log_result "14" "Envíos de pedido" "array" "ok" "PASS" ""
else
  log_result "14" "Envíos de pedido" "array" "$SSTATUS" "FAIL" "$(echo $R | head -c 100)"
fi

echo ""
# ─── 15. STORAGE ─────────────────────────────────────────
echo -e "${YELLOW}[15] STORAGE${NC}"

R=$(curl -s -X POST $API/storage/upload-url -H "$AUTH_V" -H "$TENANT_V" -H "Content-Type: application/json" -d '{"filename":"test.jpg","contentType":"image/jpeg"}')
SRES=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('url') or d.get('uploadUrl') else d.get('statusCode','') or d.get('message',''))" 2>/dev/null)
if [ "$SRES" = "ok" ]; then
  log_result "15" "Upload URL" "url" "ok" "PASS" ""
else
  log_result "15" "Upload URL" "url" "$SRES" "FAIL" "$(echo $R | head -c 100)"
fi

echo ""
# ─── 16. CANALES ─────────────────────────────────────────
echo -e "${YELLOW}[16] CANALES${NC}"

R=$(curl -s $API/channels -H "$AUTH_V" -H "$TENANT_V")
CSTATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if isinstance(d,list) else d.get('statusCode',''))" 2>/dev/null)
if [ "$CSTATUS" = "ok" ]; then
  log_result "16" "Listar canales" "array" "ok" "PASS" ""
else
  log_result "16" "Listar canales" "array" "$CSTATUS" "FAIL" "$(echo $R | head -c 100)"
fi

echo ""
# ─── 17. FACTURACIÓN ─────────────────────────────────────
echo -e "${YELLOW}[17] FACTURACIÓN${NC}"

R=$(curl -s $API/invoicing/summary -H "$AUTH_V" -H "$TENANT_V")
ISTATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if isinstance(d,dict) and not d.get('statusCode') else d.get('statusCode',''))" 2>/dev/null)
if [ "$ISTATUS" = "ok" ]; then
  log_result "17" "Resumen facturación" "object" "ok" "PASS" ""
else
  log_result "17" "Resumen facturación" "object" "$ISTATUS" "FAIL" "$(echo $R | head -c 100)"
fi

echo ""
# ─── 18. SUPER ADMIN ─────────────────────────────────────
echo -e "${YELLOW}[18] SUPER ADMIN${NC}"

R=$(curl -s $API/super-admin/stats -H "$AUTH_V" -H "$TENANT_V")
SASTATUS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('tenants') or d.get('revenue') else d.get('statusCode',''))" 2>/dev/null)
if [ "$SASTATUS" = "ok" ]; then
  log_result "18" "Stats plataforma" "data" "ok" "PASS" ""
else
  log_result "18" "Stats plataforma" "data" "$SASTATUS" "FAIL" "$(echo $R | head -c 100)"
fi

R=$(curl -s $API/super-admin/tenants -H "$AUTH_V" -H "$TENANT_V")
TCOUNT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else d.get('statusCode',''))" 2>/dev/null)
if [ "$TCOUNT" -ge "1" ] 2>/dev/null; then
  log_result "18" "Listar tenants" ">=1" "$TCOUNT" "PASS" ""
else
  log_result "18" "Listar tenants" ">=1" "$TCOUNT" "FAIL" "$(echo $R | head -c 100)"
fi

echo ""
# ─── 19. WEBHOOKS ────────────────────────────────────────
echo -e "${YELLOW}[19] WEBHOOKS${NC}"

R=$(curl -s "$API/webhooks/meta/vikids?hub.mode=subscribe&hub.verify_token=test&hub.challenge=CHALLENGE123")
if echo "$R" | grep -q "CHALLENGE123"; then
  log_result "19" "Meta webhook verify" "challenge echo" "ok" "PASS" ""
else
  log_result "19" "Meta webhook verify" "challenge echo" "$(echo $R | head -c 50)" "FAIL" ""
fi

echo ""
# ─── 20. ONBOARDING ──────────────────────────────────────
echo -e "${YELLOW}[20] ONBOARDING${NC}"

R=$(curl -s "$API/tenants/check-slug?slug=nuevo-test-xyz")
AVAIL=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('available',''))" 2>/dev/null)
if [ "$AVAIL" = "True" ] || [ "$AVAIL" = "true" ]; then
  log_result "20" "Check slug disponible" "available:true" "true" "PASS" ""
else
  log_result "20" "Check slug disponible" "available:true" "$AVAIL" "FAIL" "$(echo $R | head -c 100)"
fi

R=$(curl -s "$API/tenants/check-slug?slug=vikids")
AVAIL=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('available',''))" 2>/dev/null)
if [ "$AVAIL" = "False" ] || [ "$AVAIL" = "false" ]; then
  log_result "20" "Check slug ocupado" "available:false" "false" "PASS" ""
else
  log_result "20" "Check slug ocupado" "available:false" "$AVAIL" "FAIL" "$(echo $R | head -c 100)"
fi

echo ""
# ─── 21. FRONTEND ────────────────────────────────────────
echo -e "${YELLOW}[21] FRONTEND${NC}"

for PAGE in "/" "/login" "/onboarding" "/super-admin"; do
  R=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000$PAGE" 2>/dev/null)
  if [ "$R" = "200" ] || [ "$R" = "307" ] || [ "$R" = "302" ]; then
    log_result "21" "Frontend $PAGE" "200/3xx" "$R" "PASS" ""
  else
    log_result "21" "Frontend $PAGE" "200/3xx" "$R" "FAIL" ""
  fi
done

echo ""
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  RESULTADOS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo ""
TOTAL=$((PASS + FAIL))
echo -e "  Total: $TOTAL pruebas"
echo -e "  ${GREEN}✓ Pasaron: $PASS${NC}"
echo -e "  ${RED}✗ Fallaron: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "  ${GREEN}🎉 TODAS LAS PRUEBAS PASARON${NC}"
else
  echo -e "  ${RED}⚠️  HAY FALLOS QUE REVISAR${NC}"
fi
echo ""
