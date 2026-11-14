#!/usr/bin/env bash
# AGENTS.md is the source of truth (read by Codex, Cursor, Copilot and others).
# Claude Code reads CLAUDE.md, so each one is a generated copy. Copies rather
# than @imports or symlinks: imports are not reliably expanded from nested
# folders, and symlinks do not survive a Windows checkout.
#
#   scripts/sync-rules.sh           regenerate every CLAUDE.md
#   scripts/sync-rules.sh --check   fail if any copy is missing or out of date
set -u
cd "$(dirname "$0")/.."
HEADER='<!-- Generated from AGENTS.md by scripts/sync-rules.sh. Edit AGENTS.md, then run `npm run sync:rules`. -->'
STALE=0
while IFS= read -r src; do
  dest="$(dirname "$src")/CLAUDE.md"
  want="$(printf '%s\n\n' "$HEADER"; cat "$src")"
  if [ "${1:-}" = "--check" ]; then
    [ -f "$dest" ] && [ "$(cat "$dest")" = "$want" ] || { STALE=1; echo "out of date: $dest"; }
  else
    printf '%s\n' "$want" > "$dest"
  fi
done < <(find . -name AGENTS.md -not -path './node_modules/*' -not -path './src-tauri/target/*' | sort)
exit "$STALE"
