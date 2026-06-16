# Changelog

All notable changes to the **cortex** plugin. Versions follow [SemVer](https://semver.org).

## 0.1.3 — 2026-06-16

**Add — shipped memory-capture policy (no per-user CLAUDE.md edit needed).** A SessionStart
hook now injects a standing policy so the behaviour ships with the plugin for every install:
when a decision is reached (especially a grey-zone call) or you're told to remember one, commit
it to cortex via `memory_commit` with `tags = "decision,<project>"`; and when recalling/consulting
memory, also read cortex. It **augments** native CLAUDE.md / `/memory` / `remember` — never
replaces them. Gated by `memory.captureDecisions` (default on; `CORTEX_CAPTURE_DECISIONS=0` to
disable). Pairs with `--tag` (0.1.2) to recall a category.

## 0.1.2 — 2026-06-16

**Add — `/cortex-recall --tag <tag>`.** Filter the LLM-Wiki catalog to pages carrying one
whole tag (case-insensitive; `test` does not match `testing`) — e.g. `--tag decision` or
`--tag <project>`. Complements `--index` (all pages) and a relevance query. Enables the
"capture decisions tagged by project, recall them by category" workflow.

## 0.1.1 — 2026-06-16

**Fix — first-run dependency provisioning (the install-breaking `-32000`).** `node_modules` is
gitignored, so a fresh `/plugin install` shipped source only; the hooks then crashed on import
(silent no-op) and the MCP `cortex-memory` server returned `-32000`. The plugin now provisions its
own deps the first time it runs: a lock-guarded `scripts/ensure-deps.sh` runs `bun install` if
`node_modules` is missing, invoked both by a new SessionStart hook (for the lifecycle hooks) and by
the MCP server's launch wrapper (`.mcp.json` now `bash`-wraps the server). The lock prevents the two
from racing a double install. Also: MCP `serverInfo.version` now tracks the plugin version.

## 0.1.0 — 2026-06-15

First feature-complete release: all five faculties built, gated, and wired into the Claude Code
lifecycle. **18 deterministic gates / 351 assertions, 0 failures** (no network in CI). Pre-1.0 —
the manual install checklist (`VERIFY.md` §3) has not yet been run on a real session.

### Faculties

- **👁 Perception** — a `PostToolUse` hook compresses large tool output via ollama before it hits
  context, with a post-compression guardrail (URLs/paths/hashes/numbers preserved) and a reversible
  cache (`⟦cortex: … compressed⟧` marker → `cat .cortex-cache/<id>.txt`). Inert under a slow local
  model by design (synchronous cap) — safe, never lossy.
- **🗣 Expression** — terse output rulesets, EN (caveman-style) + TH (pordee-style), auto-detected;
  injected at `SessionStart` and reinforced per prompt. `/cortex on|off|lite|full|ultra|status`.
- **🧠 Memory** — long-term store on `bun:sqlite` (FTS5 + optional `sqlite-vec`): Episodic, Semantic
  (LLM-Wiki concept pages + cross-reference graph), and Core Memory (อริยสัจ4 error→cause→fix with
  signature dedup + recurrence `hits`). Hybrid FTS∪vec recall fused by RRF. Recalled each prompt
  (freshness-caveated), consolidated at `SessionEnd`. Skills: `/cortex-recall`, `/cortex-remember`.
  Optional MCP pull-layer (`memory_recall` / `memory_commit` / `wiki_search`).
- **🧭 Cognition** — domain-agnostic thinking disciplines + นิวรณ์5 metacognition injected at
  `SessionStart`; a chronic-recurrence red-flag per prompt (Memory→Cognition link); an
  efficient-learning rubric sharpening consolidation; `/cortex-think` for on-demand deep reasoning;
  karpathy coding discipline + a graphify discovery nudge, both **gated to coding context only**
  (never fire on writing/research/trading); and a sub-agent handoff (`PreToolUse` on `Task`/`Agent`).
- **🌙 Subconscious** — embedded ollama (local or cloud) for embeddings, read-compression, and
  consolidation, with optional tiered escalation to Claude via the `claude` CLI (subscription auth).

### Principles

- **Cooperate, not replace** — every faculty layers on native Claude Code and degrades to a no-op
  when Bun/ollama are absent or cortex is disabled; native behavior is never blocked.
- **Domain-agnostic** — works for any task; coding-specific discipline is gated to coding context.

### Deferred

- **Elysia HTTP dashboard / cross-agent shared store** (S6-T1) — out of 0.1.0 scope (D11: optional).
  The in-process lib + hooks + MCP cover the product; a daemon is not required to cooperate.
- **Async/off-path Perception compression** — the unlock for large outputs under a fast backend.

### License

BUSL-1.1 (source-available; concept reusable, code not without reimplementation) → Apache-2.0 on
2030-06-15.
