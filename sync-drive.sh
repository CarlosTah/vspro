#!/bin/bash

# Configuración
LOCAL_PATH="." 
REMOTE_PATH="google-drive:Proyecto VSPRO"

echo "🚀 Iniciando sincronización de VSPRO con Google Drive..."

# Comando rclone con filtros inteligentes
rclone sync $LOCAL_PATH "$REMOTE_PATH" \
    --exclude "node_modules/**" \
    --exclude ".git/**" \
    --exclude "dist/**" \
    --exclude ".env" \
    --exclude ".DS_Store" \
    --progress

echo "✅ Sincronización completada. Tu Gema ya puede leer los cambios."