#!/usr/bin/env bash
# Provision plugin dependencies on first run.
#
# `node_modules` is gitignored, so a fresh `/plugin install` ships SOURCE ONLY — without this the
# hooks crash on import (silently no-op via `|| true`) and the MCP server returns -32000. CC does
# not run a `bun install` step on install, so the plugin provisions itself the first time it runs.
#
# Lock-guarded: the SessionStart provisioning hook and the MCP server can both call this at the same
# time on first launch; an atomic `mkdir` lock ensures only ONE `bun install` runs while the other
# waits, so they never corrupt node_modules by installing concurrently. Best-effort: never fails the
# caller (always exits 0) so it can't block native Claude Code.
root="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
[ -d "$root/node_modules" ] && exit 0
command -v bun >/dev/null 2>&1 || exit 0

if mkdir "$root/.deps-lock" 2>/dev/null; then
  trap 'rmdir "$root/.deps-lock" 2>/dev/null' EXIT
  (cd "$root" && bun install --silent) >/dev/null 2>&1
else
  # another process is installing — wait up to ~30s for node_modules to appear
  for _ in $(seq 1 60); do [ -d "$root/node_modules" ] && break; sleep 0.5; done
fi
exit 0
