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
grep -E '^\s+(HOST|LANHOST|DB_HOST|DB_PASS|AUTOMATIC_REGISTER):' "$CONFIG" | head -5
echo "DB_HOST env override: ${DB_HOST:-none}"
echo "=================================="

exec java -jar ./Server.jar
