#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# VSPRO — Infrastructure Validation Script
# Target: production (AWS)
# Checks: secrets existence, connectivity (RDS, Redis), config integrity
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

REGION="us-east-1"
PREFIX="vspro/prod"
PASS=0
FAIL=0
WARN=0

G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; C='\033[0;36m'; NC='\033[0m'

pass() { PASS=$((PASS+1)); echo -e "  ${G}✓${NC} $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "  ${R}✗${NC} $1 — $2"; }
warn() { WARN=$((WARN+1)); echo -e "  ${Y}⚠${NC} $1"; }
section() { echo -e "\n${C}━━━ $1${NC}"; }

echo -e "${Y}═══════════════════════════════════════════════════════${NC}"
echo -e "${Y}  VSPRO Infrastructure Validation${NC}"
echo -e "${Y}  Target: production | Provider: AWS${NC}"
echo -e "${Y}═══════════════════════════════════════════════════════${NC}"

# ─── 1. AWS CLI Check ────────────────────────────────────────
section "1. AWS CLI & Credentials"

if command -v aws &>/dev/null; then
  pass "AWS CLI installed ($(aws --version 2>&1 | head -c 30))"
else
  fail "AWS CLI not installed" "brew install awscli"
  echo -e "\n${R}ABORTED: AWS CLI required for validation${NC}"
  exit 1
fi

AWS_IDENTITY=$(aws sts get-caller-identity --region $REGION 2>&1)
if echo "$AWS_IDENTITY" | grep -q "Account"; then
  ACCOUNT=$(echo "$AWS_IDENTITY" | python3 -c "import sys,json; print(json.load(sys.stdin)['Account'])" 2>/dev/null)
  pass "AWS authenticated (Account: $ACCOUNT)"
else
  fail "AWS not authenticated" "Run: aws configure"
  echo -e "\n${R}ABORTED: AWS credentials required${NC}"
  exit 1
fi

# ─── 2. Secrets Manager Validation ──────────────────────────
section "2. AWS Secrets Manager"

REQUIRED_SECRETS=(
  "DATABASE_URL"
  "REDIS_HOST"
  "REDIS_PASSWORD"
  "JWT_SECRET"
  "OPENAI_API_KEY"
  "META_APP_ID"
  "META_APP_SECRET"
  "META_WEBHOOK_VERIFY_TOKEN"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "AWS_ACCESS_KEY_ID"
  "AWS_SECRET_ACCESS_KEY"
  "RESEND_API_KEY"
)

SECRETS_FOUND=0
SECRETS_MISSING=0
SECRETS_PLACEHOLDER=0

for SECRET in "${REQUIRED_SECRETS[@]}"; do
  RESULT=$(aws secretsmanager describe-secret --secret-id "$PREFIX/$SECRET" --region $REGION 2>&1)
  if echo "$RESULT" | grep -q "ARN"; then
    # Check if value is still CHANGE_ME
    VALUE=$(aws secretsmanager get-secret-value --secret-id "$PREFIX/$SECRET" --region $REGION --query 'SecretString' --output text 2>/dev/null)
    if [ "$VALUE" = "CHANGE_ME" ]; then
      warn "$PREFIX/$SECRET exists but has placeholder value"
      SECRETS_PLACEHOLDER=$((SECRETS_PLACEHOLDER+1))
    else
      SECRETS_FOUND=$((SECRETS_FOUND+1))
    fi
  else
    fail "$PREFIX/$SECRET" "NOT FOUND — run setup-secrets.sh"
    SECRETS_MISSING=$((SECRETS_MISSING+1))
  fi
done

if [ $SECRETS_MISSING -eq 0 ] && [ $SECRETS_PLACEHOLDER -eq 0 ]; then
  pass "All ${#REQUIRED_SECRETS[@]} secrets configured ✓"
elif [ $SECRETS_MISSING -eq 0 ]; then
  warn "$SECRETS_FOUND configured, $SECRETS_PLACEHOLDER still have placeholder values"
else
  fail "$SECRETS_MISSING secrets missing" "Run: bash infrastructure/aws/setup-secrets.sh"
fi

# ─── 3. RDS Connectivity ────────────────────────────────────
section "3. RDS PostgreSQL Connectivity"

DB_URL=$(aws secretsmanager get-secret-value --secret-id "$PREFIX/DATABASE_URL" --region $REGION --query 'SecretString' --output text 2>/dev/null)

if [ -z "$DB_URL" ] || [ "$DB_URL" = "CHANGE_ME" ]; then
  warn "DATABASE_URL not configured — skipping connectivity check"
else
  # Extract host from URL
  DB_HOST=$(echo "$DB_URL" | python3 -c "import sys; from urllib.parse import urlparse; print(urlparse(sys.stdin.read().strip()).hostname or '')" 2>/dev/null)
  
  if [ -n "$DB_HOST" ]; then
    # Test DNS resolution
    if host "$DB_HOST" &>/dev/null || nslookup "$DB_HOST" &>/dev/null 2>&1; then
      pass "RDS DNS resolves: $DB_HOST"
      
      # Test TCP connectivity (port 5432)
      if nc -z -w5 "$DB_HOST" 5432 2>/dev/null; then
        pass "RDS port 5432 reachable"
      else
        fail "RDS port 5432 unreachable" "Check security group / VPC peering"
      fi
    else
      fail "RDS DNS resolution failed" "$DB_HOST"
    fi
  else
    fail "Could not parse DB_HOST from DATABASE_URL" ""
  fi
fi

# ─── 4. Redis/ElastiCache Connectivity ──────────────────────
section "4. ElastiCache Redis Connectivity"

REDIS_HOST=$(aws secretsmanager get-secret-value --secret-id "$PREFIX/REDIS_HOST" --region $REGION --query 'SecretString' --output text 2>/dev/null)

if [ -z "$REDIS_HOST" ] || [ "$REDIS_HOST" = "CHANGE_ME" ]; then
  warn "REDIS_HOST not configured — skipping connectivity check"
else
  if host "$REDIS_HOST" &>/dev/null || nslookup "$REDIS_HOST" &>/dev/null 2>&1; then
    pass "Redis DNS resolves: $REDIS_HOST"
    
    if nc -z -w5 "$REDIS_HOST" 6379 2>/dev/null; then
      pass "Redis port 6379 reachable"
    else
      fail "Redis port 6379 unreachable" "Check security group / VPC"
    fi
  else
    fail "Redis DNS resolution failed" "$REDIS_HOST"
  fi
fi

# ─── 5. ECR Repository Check ────────────────────────────────
section "5. ECR Repositories"

for REPO in "vspro-api" "vspro-worker" "vspro-web"; do
  RESULT=$(aws ecr describe-repositories --repository-names "$REPO" --region $REGION 2>&1)
  if echo "$RESULT" | grep -q "repositoryUri"; then
    pass "ECR repo exists: $REPO"
  else
    warn "ECR repo missing: $REPO — create with: aws ecr create-repository --repository-name $REPO"
  fi
done

# ─── 6. .env.production Validation ──────────────────────────
section "6. Local .env.production File"

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.production"

if [ -f "$ENV_FILE" ]; then
  pass ".env.production exists"
  
  # Check for CHANGE_ME placeholders
  PLACEHOLDERS=$(grep -c "CHANGE_ME" "$ENV_FILE" 2>/dev/null || echo "0")
  if [ "$PLACEHOLDERS" -gt "0" ]; then
    warn "$PLACEHOLDERS variables still have CHANGE_ME placeholder"
  else
    pass "No placeholder values found"
  fi
  
  # Verify critical vars are present
  for VAR in "DATABASE_URL" "REDIS_HOST" "JWT_SECRET" "OPENAI_API_KEY" "NODE_ENV"; do
    if grep -q "^$VAR=" "$ENV_FILE"; then
      pass "$VAR defined"
    else
      fail "$VAR missing from .env.production" ""
    fi
  done
else
  fail ".env.production not found" "Run: kiro env:setup --target=production"
fi

# ─── 7. Docker Images ───────────────────────────────────────
section "7. Docker Build Readiness"

for DOCKERFILE in "apps/api/Dockerfile" "apps/worker/Dockerfile"; do
  if [ -f "$(cd "$(dirname "$0")/.." && pwd)/$DOCKERFILE" ]; then
    pass "$DOCKERFILE exists"
  else
    fail "$DOCKERFILE missing" ""
  fi
done

# ─── 8. SSL / Domain ────────────────────────────────────────
section "8. SSL & Domain Configuration"

if grep -q "TRUST_PROXY=true" "$ENV_FILE" 2>/dev/null; then
  pass "TRUST_PROXY enabled (ALB SSL termination)"
else
  warn "TRUST_PROXY not set — needed for ALB"
fi

if grep -q "https://" "$ENV_FILE" 2>/dev/null; then
  pass "HTTPS URLs configured in APP_URL/API_URL"
else
  warn "No HTTPS URLs found in .env.production"
fi

# ─── RESULTS ─────────────────────────────────────────────────
echo ""
echo -e "${Y}═══════════════════════════════════════════════════════${NC}"
echo -e "${Y}  VALIDATION RESULTS${NC}"
echo -e "${Y}═══════════════════════════════════════════════════════${NC}"
echo -e "  ${G}✓ Passed: $PASS${NC}"
echo -e "  ${Y}⚠ Warnings: $WARN${NC}"
echo -e "  ${R}✗ Failed: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ] && [ $WARN -eq 0 ]; then
  echo -e "  ${G}🚀 READY FOR DEPLOYMENT${NC}"
elif [ $FAIL -eq 0 ]; then
  echo -e "  ${Y}⚠️  Warnings to address before deploy${NC}"
else
  echo -e "  ${R}❌ BLOCKERS found — fix before deploying${NC}"
fi
echo ""
