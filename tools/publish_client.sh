#!/bin/bash
# AugurMS Client Publisher — Upload patched WZ files to R2 and bump launcher manifest
#
# Usage:
#   ./tools/publish_client.sh [patched-dir]
#
# Prerequisites:
#   - npx wrangler configured with R2 access
#   - Dashboard running (for manifest bump API)

set -euo pipefail

PATCHED_DIR="${1:-./patched}"
DASHBOARD_URL="${DASHBOARD_URL:-https://augurms.com}"
R2_BUCKET="augurms-client"

if [ ! -d "$PATCHED_DIR" ]; then
  echo "ERROR: Patched directory not found: $PATCHED_DIR"
  echo "Run the WZ patcher first: python3 tools/wz_patcher.py --manifest items.json --wz-dir ./client/cosmic-wz"
  exit 1
fi

echo "=== AugurMS Client Publisher ==="
echo "Source: $PATCHED_DIR"
echo ""

# Upload each .wz file that was modified
UPLOADED_FILES=()
for wz_file in "$PATCHED_DIR"/*.wz; do
  [ -f "$wz_file" ] || continue
  filename=$(basename "$wz_file")

  echo "--- Uploading $filename ---"
  size=$(wc -c < "$wz_file" | tr -d ' ')
  hash=$(shasum -a 256 "$wz_file" | awk '{print $1}')
  echo "  Size: $size bytes"
  echo "  SHA256: $hash"

  npx wrangler r2 object put "$R2_BUCKET/$filename" --file "$wz_file" --remote
  echo "  Uploaded to R2: $R2_BUCKET/$filename"

  UPLOADED_FILES+=("{\"name\":\"$filename\",\"hash\":\"$hash\",\"size\":$size}")
done

if [ ${#UPLOADED_FILES[@]} -eq 0 ]; then
  echo "No .wz files found to upload in $PATCHED_DIR"
  exit 0
fi

# Build the files array for manifest update
FILES_JSON=$(printf '%s,' "${UPLOADED_FILES[@]}")
FILES_JSON="[${FILES_JSON%,}]"

echo ""
echo "--- Bumping launcher manifest ---"
echo "Files: $FILES_JSON"

# Bump manifest version via dashboard API
# The publish_client_update tool in the GM engine does this,
# but we can also do it directly
CURRENT_VERSION=$(curl -s "$DASHBOARD_URL/api/launcher/manifest" | python3 -c "import sys,json; print(json.load(sys.stdin).get('version','1.0.0'))" 2>/dev/null || echo "1.0.0")

# Increment patch version
IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
NEW_VERSION="$major.$minor.$((patch + 1))"

echo "  Current version: $CURRENT_VERSION"
echo "  New version: $NEW_VERSION"

# Update manifest via API
curl -s -X POST "$DASHBOARD_URL/api/launcher/manifest" \
  -H "Content-Type: application/json" \
  -d "{\"manifest\":{\"version\":\"$NEW_VERSION\",\"files\":$FILES_JSON}}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('  Manifest updated!' if d.get('success') else f'  ERROR: {d}')" 2>/dev/null \
  || echo "  WARNING: Could not update manifest via API. Update manually."

echo ""
echo "=== Done ==="
echo "Version: $CURRENT_VERSION -> $NEW_VERSION"
echo "Players will auto-download updated files on next launcher start."
