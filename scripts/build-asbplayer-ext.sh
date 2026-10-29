#!/bin/bash
# Build asbplayer extension (Chrome) and copy it to a fixed folder on C:.
# Usage (from repo root): ./scripts/build-asbplayer-ext.sh
set -e
cd "$(dirname "$0")/.."

# The repo pins its pnpm in devEngines, and any other pnpm refuses to run
# (ERR_PNPM_BAD_PM_VERSION). When the global one differs and mise is installed,
# ask mise for the pinned version instead of failing.
pinned="$(node -p "require('./package.json').devEngines?.packageManager?.version ?? ''")"
current="$(pnpm --version 2>/dev/null || true)"
if [ -n "$pinned" ] && [ "$pinned" != "$current" ] && command -v mise >/dev/null 2>&1; then
  run_pnpm() { mise exec "pnpm@$pinned" -- pnpm "$@"; }
else
  run_pnpm() { pnpm "$@"; }
fi

run_pnpm --filter @project/extension run build

DEST="/mnt/c/asbplayer-ext"
rm -rf "$DEST"
cp -r extension/.output/chrome-mv3 "$DEST"
echo 'Done -> C:\asbplayer-ext (reload the extension at chrome://extensions)'
