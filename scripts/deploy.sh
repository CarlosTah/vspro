#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# VSPRO — Deploy Script for DigitalOcean
# Run on the server: ./scripts/deploy.sh
# ═══════════════════════════════════════════════════════════════

set -e

APP_DIR="/home/vspro/app"
COMPOSE_FILE="docker-compose.production.yml"

echo "╔══════════════════════════════════════════╗"
echo "║       VSPRO — Production Deploy          ║"
echo "╚══════════════════════════════════════════╝"

cd "$APP_DIR"

# Pull latest code (if using git)
if [ -d ".git" ]; then
    echo "→ Pulling latest changes..."
    git pull origin main
fi

# Build and deploy
echo "→ Building Docker images..."
docker compose -f "$COMPOSE_FILE" build --no-cache

echo "→ Running database migrations..."
docker compose -f "$COMPOSE_FILE" run --rm api npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "→ Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

echo "→ Cleaning up old images..."
docker image prune -f

echo ""
echo "✓ Deploy complete!"
echo "  API:  http://localhost:3001/health"
echo "  Web:  http://localhost:3000"
echo ""
echo "→ Check logs: docker compose -f $COMPOSE_FILE logs -f"
