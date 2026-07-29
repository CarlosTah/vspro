#!/bin/bash
# Migrate base64 media assets to DO Spaces CDN
# Run on the DigitalOcean server (host level)

set -e

DB_CMD="docker exec vspro_postgres psql -U vspro -d vspro_db -t -A"

echo "=== Media Migration to CDN ==="

# Get all tenant schemas
SCHEMAS=$($DB_CMD -c "SELECT \"schemaName\" FROM tenants WHERE status IN ('ACTIVE','TRIAL')")

for SCHEMA in $SCHEMAS; do
  echo ""
  echo "--- Schema: $SCHEMA ---"
  
  # Check if table exists
  TABLE_EXISTS=$($DB_CMD -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$SCHEMA' AND table_name = 'media_assets'")
  if [ "$TABLE_EXISTS" = "0" ]; then
    echo "  No media_assets table"
    continue
  fi

  # Get IDs of base64 assets
  IDS=$($DB_CMD -c "SELECT id FROM \"$SCHEMA\".media_assets WHERE url LIKE 'data:%' AND is_active = true" 2>/dev/null || true)
  
  if [ -z "$IDS" ]; then
    echo "  No base64 assets"
    continue
  fi

  echo "  Found base64 assets: $(echo "$IDS" | wc -l | tr -d ' ')"
  
  for ID in $IDS; do
    # Get asset details
    DETAILS=$($DB_CMD -c "SELECT type || '|' || COALESCE(title,'untitled') FROM \"$SCHEMA\".media_assets WHERE id = '$ID'::uuid")
    TYPE=$(echo "$DETAILS" | cut -d'|' -f1)
    TITLE=$(echo "$DETAILS" | cut -d'|' -f2)
    
    # Extract base64 data and save to temp file
    $DB_CMD -c "SELECT substring(url from 'base64,(.+)$') FROM \"$SCHEMA\".media_assets WHERE id = '$ID'::uuid" > /tmp/b64data.txt
    
    # Detect mime type
    MIME=$($DB_CMD -c "SELECT substring(url from '^data:(image/\w+);') FROM \"$SCHEMA\".media_assets WHERE id = '$ID'::uuid")
    
    EXT="jpg"
    if [ "$MIME" = "image/png" ]; then EXT="png"; fi
    
    # Decode base64 to binary
    base64 -d /tmp/b64data.txt > /tmp/media_file.$EXT
    
    # Upload to DO Spaces using docker exec in api container (has aws-sdk)
    # Actually let's use s3cmd or direct curl
    KEY="media/$SCHEMA/$TYPE/$ID.$EXT"
    
    # Upload using curl with S3 REST API
    RESOURCE="/$KEY"
    BUCKET="vspro-uploads"
    S3_KEY="DO00WUFNZBB7BQGYZQB2"
    S3_SECRET="LQgRHcKpP4aYuVnvrAN+Ur0i+zXDNm4ynGfzWURZWc8"
    ENDPOINT="https://${BUCKET}.nyc3.digitaloceanspaces.com"
    DATE=$(date -u +"%a, %d %b %Y %T %z")
    CONTENT_TYPE="$MIME"
    
    STRING_TO_SIGN="PUT\n\n${CONTENT_TYPE}\n${DATE}\nx-amz-acl:public-read\n/${BUCKET}/${KEY}"
    SIGNATURE=$(echo -en "$STRING_TO_SIGN" | openssl sha1 -hmac "$S3_SECRET" -binary | base64)
    
    curl -s -X PUT \
      -H "Host: ${BUCKET}.nyc3.digitaloceanspaces.com" \
      -H "Date: ${DATE}" \
      -H "Content-Type: ${CONTENT_TYPE}" \
      -H "x-amz-acl: public-read" \
      -H "Authorization: AWS ${S3_KEY}:${SIGNATURE}" \
      --data-binary @/tmp/media_file.$EXT \
      "${ENDPOINT}/${KEY}"
    
    PUBLIC_URL="${ENDPOINT}/${KEY}"
    
    # Update DB
    $DB_CMD -c "UPDATE \"$SCHEMA\".media_assets SET url = '$PUBLIC_URL' WHERE id = '$ID'::uuid"
    
    echo "  [OK] $TITLE → $PUBLIC_URL"
  done
done

rm -f /tmp/b64data.txt /tmp/media_file.* 2>/dev/null

echo ""
echo "✅ Migration complete"
