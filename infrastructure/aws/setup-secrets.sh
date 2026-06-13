#!/bin/bash
# ─────────────────────────────────────────────────────────────
# VSPRO — AWS Secrets Manager Setup
# Run once to create all required secrets in AWS.
# Then fill values via AWS Console or CLI.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

REGION="us-east-1"
PREFIX="vspro/prod"

echo "Creating VSPRO production secrets in AWS Secrets Manager..."
echo "Region: $REGION"
echo ""

SECRETS=(
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
  "STRIPE_PRICE_BASIC_MONTHLY"
  "STRIPE_PRICE_PRO_MONTHLY"
  "STRIPE_PRICE_ENTERPRISE_MONTHLY"
  "AWS_ACCESS_KEY_ID"
  "AWS_SECRET_ACCESS_KEY"
  "AWS_S3_BUCKET"
  "RESEND_API_KEY"
  "FACTURAPI_KEY"
)

for SECRET in "${SECRETS[@]}"; do
  echo -n "  Creating $PREFIX/$SECRET... "
  aws secretsmanager create-secret \
    --name "$PREFIX/$SECRET" \
    --description "VSPRO production: $SECRET" \
    --secret-string "CHANGE_ME" \
    --region "$REGION" \
    2>/dev/null && echo "✓" || echo "already exists"
done

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ Secrets created. Now update values:"
echo ""
echo "  aws secretsmanager put-secret-value \\"
echo "    --secret-id $PREFIX/DATABASE_URL \\"
echo "    --secret-string 'postgresql://...' \\"
echo "    --region $REGION"
echo ""
echo "  Or use AWS Console → Secrets Manager → $PREFIX/*"
echo "═══════════════════════════════════════════════════════"
