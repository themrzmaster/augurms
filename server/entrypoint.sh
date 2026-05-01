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

# WZ files: the image bakes in server-wz-baseline.tar.gz (a complete 16-WZ
# set). server-wz.tar.gz on R2 is overlaid additively at runtime — it can
# be a full set or a partial patch, both are safe.
WZ_URL="https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev/server-wz.tar.gz"
WZ_VERSION_URL="https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev/server-wz.version"
WZ_BASELINE_URL="https://pub-34b8b332208f464a9e74fa14104be3e2.r2.dev/server-wz-baseline.tar.gz"
LOCAL_VERSION_FILE="/opt/server/wz/.version"

# Defensive: if any of the 16 expected baseline WZs is missing on disk
# (e.g. earlier image was built from a partial server-wz.tar.gz), restore
# from baseline before applying any overlay.
REQUIRED_WZ=(Base.wz Character.wz Effect.wz Etc.wz Item.wz Map.wz Mob.wz Morph.wz Npc.wz Quest.wz Reactor.wz Skill.wz Sound.wz String.wz TamingMob.wz UI.wz)
NEED_BASELINE=0
for w in "${REQUIRED_WZ[@]}"; do
  if [ ! -e "/opt/server/wz/$w" ]; then
    echo "Baseline WZ missing: $w"
    NEED_BASELINE=1
  fi
done

if [ "$NEED_BASELINE" -eq 1 ]; then
  echo "Restoring complete WZ baseline from R2..."
  if curl -fsSL "$WZ_BASELINE_URL" -o /tmp/wz-baseline.tar.gz; then
    tar xzf /tmp/wz-baseline.tar.gz -C /opt/server
    rm -f /tmp/wz-baseline.tar.gz
    echo "Baseline restored"
  else
    echo "FATAL: baseline download failed and required WZ files are missing"
    exit 1
  fi
fi

REMOTE_VER=$(curl -sf "$WZ_VERSION_URL" 2>/dev/null || echo "")
LOCAL_VER=$(cat "$LOCAL_VERSION_FILE" 2>/dev/null || echo "")

if [ -n "$REMOTE_VER" ] && [ "$REMOTE_VER" != "$LOCAL_VER" ]; then
  echo "WZ overlay detected (remote=$REMOTE_VER), downloading..."
  if curl -fsSL "$WZ_URL" -o /tmp/wz.tar.gz; then
    tar xzf /tmp/wz.tar.gz -C /opt/server
    rm -f /tmp/wz.tar.gz
    echo "$REMOTE_VER" > "$LOCAL_VERSION_FILE"
    echo "WZ overlay applied"
  else
    echo "WZ overlay download failed, continuing with baseline"
  fi
else
  echo "WZ overlay up to date${LOCAL_VER:+ ($LOCAL_VER)}"
fi

exec java -Xmx1280m -Xms512m -jar ./Server.jar
