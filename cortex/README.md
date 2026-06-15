# cortex 🧠

> Human-brain-like **memory + cognition** for Claude Code — always-on, lifecycle-integrated, token-efficient.

cortex gives Claude Code a brain-shaped working model that **cooperates with** (does not replace) its native features, and offloads cheap background work to an **embedded LLM via ollama** (local or cloud) so expensive Claude tokens go to high-value reasoning.

> **Status:** 🚧 In development (v0.0.1, Sprint 0 — Foundation). See [`../ROADMAP.md`](../ROADMAP.md) for the full plan and progress.

## The brain model

```
👁  Perception   compress what Claude READS (tool output/files/logs) — before context fills
🗣  Expression   terse output, EN (caveman-style) + TH (pordee-style), auto-detect
🧠  Memory       long-term: Episodic · Semantic (LLM-Wiki) · Core Memory (อริยสัจ4 anti-repeat)
🧭  Cognition    critical thinking + อภิธรรม wisdom + efficient learning
🌙  Subconscious ollama does embeddings · read-compression · consolidation (→ optional Claude escalation)
```

**Guiding principle — cooperate, not replace.** cortex layers on top of CLAUDE.md, native context management/compaction, native memory, and native reasoning; it amplifies them and defers to them.

## Prerequisites

- **[Bun](https://bun.sh) ≥ 1.2** — the plugin runtime (TypeScript, built-in SQLite). Install: `curl -fsSL https://bun.sh/install | bash`. *If Bun is absent, cortex no-ops and native Claude Code is unaffected.*
- **[ollama](https://ollama.com)** — local (`ollama serve`) or cloud account. *Optional:* if ollama is absent, cortex degrades gracefully and never blocks Claude Code.
- *Optional:* tiered **Claude escalation** for higher-accuracy memory consolidation — runs via the `claude` CLI, reusing your Claude Code auth (a Pro/Max **subscription** works with no API key). Pick the model (`sonnet`/`opus`/`haiku`) in config.

## Install

```bash
/plugin marketplace add <your-github>/claude-smartwork-plugin
/plugin install cortex@claude-smartwork
```

*(Install flow finalized in a later sprint; see ROADMAP M6.)*

## Configuration

Copy [`cortex.local.md.example`](./cortex.local.md.example) to `.claude/cortex.local.md` (project) or `~/.claude/cortex.local.md` (user). Environment variables override file settings.

| Setting | Env var | Default |
|---|---|---|
| Enable cortex | `CORTEX_ENABLED` | `true` |
| ollama host | `OLLAMA_HOST` | `http://localhost:11434` |
| ollama cloud key | `OLLAMA_API_KEY` | — |
| Embedding model | `CORTEX_EMBED_MODEL` | `nomic-embed-text` |
| Compression model | `CORTEX_COMPRESS_MODEL` | `qwen2.5:3b` |
| Claude escalation | `CORTEX_ESCALATION` | `false` |
| Escalation model | `CORTEX_ESCALATION_MODEL` | `sonnet` |
| Memory dir | `CORTEX_MEMORY_DIR` | `$CLAUDE_CONFIG_DIR/cortex/memory` |

## Controls

Adjust terse output and check savings at any time with `/cortex`:

| Command | Effect |
|---|---|
| `/cortex off` | stop terse-output nudges |
| `/cortex lite` · `full` · `ultra` | set the terseness level |
| `/cortex on` | back to the configured default |
| `/cortex status` | show effective state + cumulative token savings |

Changes take effect from the next prompt. Everything is opt-in style guidance — turning cortex off changes nothing native.

## Memory tools (MCP)

Memory is mostly **automatic** (recalled into context each prompt, consolidated at session end). For the times Claude needs to reach for it mid-task, cortex also ships a small MCP server (`cortex-memory`, auto-discovered via `.mcp.json`) exposing three tools:

| Tool | Does |
|---|---|
| `memory_recall` | recall past lessons (Core Memory) + knowledge (LLM-Wiki) for a query — returns a freshness-caveated block |
| `memory_commit` | save one lesson (dedups by signature) or one knowledge page (upserts by title) |
| `wiki_search` | search the LLM-Wiki, or list the whole page catalog |

Requires Bun on `PATH`. If Bun is absent the server simply won't connect — the rest of Claude Code is unaffected.

## Attribution

Reimplemented from scratch, inspired by these projects (patterns only, no source copied):
[caveman](https://github.com/JuliusBrussee/caveman) (MIT) · [pordee](https://github.com/kerlos/pordee) (MIT) · [headroom](https://github.com/chopratejas/headroom) (Apache-2.0) · buddhist-method (MIT). Memory architecture inspired by [arra-oracle-v3](https://github.com/Soul-Brews-Studio/arra-oracle-v3) (BUSL-1.1 — concept only).

Working tooling/standards: [graphify](https://github.com/safishamsi/graphify) · [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills).

## License

**BUSL-1.1** (Business Source License) — source-available: study and reuse the *concepts* freely, but the code may not be reused without reimplementation. Converts to **Apache-2.0** on 2030-06-15. See [`../LICENSE`](../LICENSE).
