#!/bin/sh
# Sync OpenClaw data between local ephemeral storage and Azure Files mount
# Azure Files doesn't support chmod/symlink, so we use copy-based sync

MOUNT="/mnt/openclaw-data"
LOCAL="/home/node/.openclaw"

restore() {
  echo "[sync] Restoring persistent data from Azure Files..."
  if [ -d "$MOUNT/agents" ]; then
    cp -a "$MOUNT/agents" "$LOCAL/" 2>/dev/null || true
    echo "[sync] Restored agents data"
  fi
  if [ -d "$MOUNT/conversations" ]; then
    cp -a "$MOUNT/conversations" "$LOCAL/" 2>/dev/null || true
    echo "[sync] Restored conversations data"
  fi
  echo "[sync] Restore complete"
}

save() {
  mkdir -p "$MOUNT/agents" "$MOUNT/conversations" 2>/dev/null || true
  if [ -d "$LOCAL/agents" ]; then
    cp -rf "$LOCAL/agents/"* "$MOUNT/agents/" 2>/dev/null || true
  fi
  if [ -d "$LOCAL/conversations" ]; then
    cp -rf "$LOCAL/conversations/"* "$MOUNT/conversations/" 2>/dev/null || true
  fi
}

watch() {
  echo "[sync] Starting background sync (every 60s)..."
  while true; do
    sleep 60
    save
  done
}

case "$1" in
  restore) restore ;;
  save)    save ;;
  watch)   watch ;;
  *)       echo "Usage: $0 {restore|save|watch}" ;;
esac
