#!/bin/bash
# Build asbplayer extension (Chrome) and copy it to a fixed folder on C:.
# Usage (from repo root): ./scripts/build-asbplayer-ext.sh
set -e
cd "$(dirname "$0")/.."
pnpm --filter @project/extension run build
DEST="/mnt/c/asbplayer-ext"
rm -rf "$DEST"
cp -r extension/.output/chrome-mv3 "$DEST"
echo 'Done -> C:\asbplayer-ext (reload the extension at chrome://extensions)'
