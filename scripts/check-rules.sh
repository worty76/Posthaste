#!/usr/bin/env bash
# Mechanical checks for the rules in the AGENTS.md files. Rules that a grep
# can enforce live here, so they fail the build instead of relying on review.
# Run via `npm run check:rules` (part of `npm run check`).
set -u
cd "$(dirname "$0")/.."
FAIL=0
rule() { # rule "<message>" "<offending lines>"
  if [ -n "$2" ]; then FAIL=1; printf '\n✗ %s\n%s\n' "$1" "$2"; fi
}

rule "Raw colours are only allowed in src/styles/tokens.css (src/styles/AGENTS.md)" \
  "$(grep -rnE '#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(' src --include='*.css' --include='*.tsx' --include='*.ts' \
      | grep -v '^src/styles/tokens.css:' | grep -v '\.test\.' | grep -v '^src/test/')"

rule "Inline style props are not allowed; use a class and tokens (src/AGENTS.md)" \
  "$(grep -rnE 'style=\{' src --include='*.tsx')"

rule "Only src/lib/ipc.ts and src/main.tsx may import @tauri-apps (src/AGENTS.md)" \
  "$(grep -rnE "from \"@tauri-apps" src | grep -v '^src/lib/ipc.ts:' | grep -v '^src/main.tsx:')"

rule "localStorage/sessionStorage are not used; state lives in SQLite (AGENTS.md)" \
  "$(grep -rnE '\b(localStorage|sessionStorage|indexedDB)\b' src --include='*.ts' --include='*.tsx')"

rule "No network calls from the UI (AGENTS.md)" \
  "$(grep -rnE '\bfetch\(|XMLHttpRequest|WebSocket\(|https?://' src --include='*.ts' --include='*.tsx' | grep -v '\.test\.')"

rule "posthaste-core must not depend on Tauri (src-tauri/crates/core/AGENTS.md)" \
  "$(grep -nE '^\s*tauri' src-tauri/crates/core/Cargo.toml)"

rule "Shipped migrations are append-only: do not edit, add a new numbered file (src-tauri/crates/core/AGENTS.md)" \
  "$(git diff --name-only --diff-filter=MD HEAD -- src-tauri/crates/core/migrations 2>/dev/null)"

rule "No unwrap()/expect() in non-test Rust; return an error (src-tauri/AGENTS.md)" \
  "$(grep -rnE '\.unwrap\(\)|\.expect\(' src-tauri/src src-tauri/crates/*/src --include='*.rs' \
      | grep -v '/tests.rs:' | grep -v 'could not start' \
      | awk -F: '{ if (system("awk \"NR<" $2 " && /#\\[cfg\\(test\\)\\]/ {f=1} END {exit !f}\" " $1) != 0) print }')"

rule "CLAUDE.md copies are out of date; run: npm run sync:rules (AGENTS.md)" \
  "$(bash scripts/sync-rules.sh --check)"

if [ "$FAIL" -eq 0 ]; then echo "rules: ok"; fi
exit "$FAIL"
