#!/bin/bash
set -e

CONFIG="/opt/server/config.yaml"

# Use exact key matching (anchored to line start with spaces) to avoid partial matches
# Config format: "  KEY: value" (2 spaces indent under server:)

if [ -n "$GAME_HOST" ]; then
  sed -i 's|^  HOST: .*|  HOST: '"$GAME_HOST"'|' "$CONFIG"
  sed -i 's|^  LANHOST: .*|  LANHOST: '"$GAME_HOST"'|' "$CONFIG"
fi

if [ -n "$DB_PASS" ]; then
  sed -i 's|^  DB_PASS: .*|  DB_PASS: "'"$DB_PASS"'"|' "$CONFIG"
fi

if [ -n "$DISABLE_AUTO_REGISTER" ]; then
  sed -i 's|^  AUTOMATIC_REGISTER: .*|  AUTOMATIC_REGISTER: false|' "$CONFIG"
fi

echo "=== AugurMS Game Server starting ==="
grep -E '^\s+(HOST|LANHOST|DB_HOST|AUTOMATIC_REGISTER):' "$CONFIG" | head -5
echo "DB_HOST env override: ${DB_HOST:-none}"
echo "=================================="

# Check for WZ updates from R2 before starting
WZ_URL="https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev/server-wz.tar.gz"
WZ_VERSION_URL="https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev/server-wz.version"
LOCAL_VERSION_FILE="/opt/server/wz/.version"

REMOTE_VER=$(curl -sf "$WZ_VERSION_URL" 2>/dev/null || echo "")
LOCAL_VER=$(cat "$LOCAL_VERSION_FILE" 2>/dev/null || echo "")

if [ -n "$REMOTE_VER" ] && [ "$REMOTE_VER" != "$LOCAL_VER" ]; then
  echo "WZ update detected (remote=$REMOTE_VER), downloading..."
  if curl -fsSL "$WZ_URL" -o /tmp/wz.tar.gz; then
    tar xzf /tmp/wz.tar.gz -C /opt/server
    rm -f /tmp/wz.tar.gz
    echo "$REMOTE_VER" > "$LOCAL_VERSION_FILE"
    echo "WZ updated successfully"
  else
    echo "WZ download failed, using existing files"
  fi
else
  echo "WZ files up to date${LOCAL_VER:+ ($LOCAL_VER)}"
fi

exec java -jar ./Server.jar
