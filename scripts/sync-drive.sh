#!/bin/bash
# ─────────────────────────────────────────────────────────────
# VSPRO — Sincronización con Google Drive
# Uso:
#   ./scripts/sync-drive.sh          → sincronización única
#   ./scripts/sync-drive.sh --watch  → modo watcher (monitorea cambios)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# Configuración
REMOTE="GoogleDrive:Proyecto VSPRO"
LOCAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FILTER_FILE="$LOCAL_DIR/scripts/.rclone-filter"
LOG_PREFIX="[vspro-sync]"

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Verificar dependencias ─────────────────────────────────

check_deps() {
  if ! command -v rclone &> /dev/null; then
    echo -e "${YELLOW}${LOG_PREFIX} rclone no encontrado. Instalando...${NC}"
    brew install rclone
  fi

  if ! rclone listremotes | grep -q "GoogleDrive:"; then
    echo -e "${YELLOW}${LOG_PREFIX} Remote 'GoogleDrive' no configurado.${NC}"
    echo "Ejecuta: rclone config"
    echo "  → New remote → nombre: GoogleDrive → tipo: drive → sigue las instrucciones"
    exit 1
  fi
}

# ─── Sincronización ─────────────────────────────────────────

sync() {
  local start_time=$(date +%s)
  echo -e "${CYAN}${LOG_PREFIX} Sincronizando → ${REMOTE}${NC}"

  rclone sync "$LOCAL_DIR" "$REMOTE" \
    --filter-from "$FILTER_FILE" \
    --transfers 4 \
    --checkers 8 \
    --contimeout 30s \
    --timeout 60s \
    --retries 3 \
    --low-level-retries 5 \
    --stats-one-line \
    --stats 0 \
    --log-level NOTICE \
    --drive-chunk-size 64M

  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  echo -e "${GREEN}${LOG_PREFIX} ✅ Sincronización completada en ${duration}s — $(date '+%H:%M:%S')${NC}"
}

# ─── Modo Watcher ────────────────────────────────────────────

watch_mode() {
  if ! command -v fswatch &> /dev/null; then
    echo -e "${YELLOW}${LOG_PREFIX} fswatch no encontrado. Instalando...${NC}"
    brew install fswatch
  fi

  echo -e "${CYAN}${LOG_PREFIX} 👁️  Modo watcher activo — monitoreando cambios...${NC}"
  echo -e "${CYAN}${LOG_PREFIX} Archivos: *.ts, *.tsx, *.json, *.sql, *.md, *.yml${NC}"
  echo -e "${CYAN}${LOG_PREFIX} Ctrl+C para detener${NC}"
  echo ""

  # Sincronización inicial
  sync

  # Monitorear cambios con debounce de 5 segundos
  fswatch -r "$LOCAL_DIR" \
    --include='\.ts$' \
    --include='\.tsx$' \
    --include='\.json$' \
    --include='\.sql$' \
    --include='\.md$' \
    --include='\.yml$' \
    --include='\.yaml$' \
    --exclude='node_modules' \
    --exclude='\.git' \
    --exclude='dist' \
    --exclude='\.next' \
    --exclude='\.turbo' \
    --latency 5 \
    | while read -r _event; do
        sync
      done
}

# ─── Main ────────────────────────────────────────────────────

check_deps

case "${1:-}" in
  --watch|-w)
    watch_mode
    ;;
  *)
    sync
    ;;
esac
