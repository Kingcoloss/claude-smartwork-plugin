# cortex — install & verification checklist

Run before publishing or after a local install. Two layers: **automated** (deterministic, no
network) and **manual** (a real Claude Code session, observing each faculty).

> ## ✅ Verification run — 2026-06-15 (Claude Code 2.1.177, Bun 1.3.14, ollama up, homebrew sqlite/vec0)
>
> Most of §2–§4 was executed mechanically against the real components (not the gate harness):
> - **Real CC plugin load** — `claude --plugin-dir <abs>/cortex plugin details cortex` → **cortex 0.1.0**,
>   Skills (4) cortex/recall/remember/think, **Hooks (5)** PreToolUse·SessionStart·UserPromptSubmit·
>   PostToolUse·SessionEnd, MCP (1) cortex-memory, ~531 tok always-on. CC discovered every component.
> - **Live memory + vec0 KNN** (`scripts/acceptance-live.ts`, real ollama embeddings) — `[fts+vec]`
>   sources confirm the vec retriever fires live (every gate runs FTS-only with fake vectors).
> - **Live consolidation** — the SessionEnd distiller extracted a lesson + a page from a sample
>   transcript and both were recallable (the S4-T6 happy-path the gates can only seam-test).
> - **Live Perception** — prose 1704→425 chars (25%) in ~7s, **under** the 15s cap → a real win on
>   small/compressible payloads (refines the S2-T5 "inert" note — inert only when generation exceeds the cap).
> - **MCP tools/call over stdio** — `memory_commit` then (awaiting its result) `memory_recall` returned
>   the freshness-caveated lesson. *Finding:* open-per-call has no cross-call write-ordering guarantee if a
>   client **pipelines** requests; real clients await each result, so this is a non-issue in practice.
> - **Degradation** — `CORTEX_ENABLED=0` → `openMemory` null; dead ollama → store writes/recalls FTS-only,
>   no throw; the `command -v bun` guard no-ops when bun is absent.
>
> **Residual (needs a full interactive session, low-risk):** observing the model *act on* the injected
> SessionStart primers mid-conversation. The injection *reaching* the model's context was already proven
> live in S3-T4 (headless marker probe), so this is a behavioral spot-check, not an unknown.

## 1. Automated — gate suite (no ollama / no network)

From `cortex/`:

```bash
bun run typecheck
for t in perception expression cognition cortex-stats memory memory-recall \
         memory-consolidate cortex-cli mcp cognition-discipline cognition-metacog \
         cognition-wire cognition-learning cortex-think cognition-coding \
         cognition-graphify lifecycle manifest; do
  bun run scripts/$t-test.ts || echo "FAILED: $t"
done
```

- [ ] `typecheck` clean
- [ ] all **18 gates** pass → **351 assertions**, 0 failures
- [ ] `manifest-test` green — plugin/marketplace/.mcp/hooks manifests valid & consistent
- [ ] `lifecycle-test` green — eight hooks wired, conflict-free across the five events

## 1b. Live diagnostic (needs ollama — exercises what gates can't)

The gates run FTS-only with fake vectors; this drives the real ollama embed + vec0 KNN + the
consolidation distiller. SKIPs cleanly when a backend is absent.

```bash
# set the embed model to whatever is pulled (default is nomic-embed-text)
CORTEX_EMBED_MODEL=<your-embed-model> bun run scripts/acceptance-live.ts
```

- [ ] vec0 KNN fires on live embeddings (`[fts+vec]` sources)
- [ ] consolidation distils a transcript → recallable lesson/page
- [ ] degradation: disabled → no-op; dead ollama → FTS-only, no throw

## 2. Manual — local install

Dev install (no marketplace round-trip):

```bash
claude --plugin-dir /absolute/path/to/cortex
```

Cheap load + discovery check (no model turn — CC parses the plugin and prints its inventory + token cost):

```bash
claude --plugin-dir /absolute/path/to/cortex plugin details cortex
# expect: cortex 0.1.0 · Skills (4) · Hooks (5) · MCP (1) cortex-memory
```

Or via the marketplace:

```bash
/plugin marketplace add <owner>/claude-smartwork-plugin
/plugin install cortex@claude-smartwork
```

- [ ] plugin loads without error; `/plugin` lists **cortex** as installed
- [ ] the three `/cortex-*` skills and `/cortex` are offered
- [ ] the `cortex-memory` MCP server connects (Bun on `PATH`)

## 3. Manual — behavior per faculty

- [ ] **Expression** — replies are terse; `/cortex status` reports the mode + cumulative savings;
      `/cortex off` then a prompt → normal prose; `/cortex full` → terse again.
- [ ] **Memory** — `/cortex-remember --lesson "<problem>" --fix "<fix>"` saves; `/cortex-recall
      "<topic>"` returns it with the freshness caveat; re-saving the same lesson reports
      `recurrence — hits bumped`.
- [ ] **Cognition** — `/cortex-think "<hard problem>"` returns the discipline + นิวรณ์5 scaffold;
      a coding prompt gets the karpathy coding block, a writing/research/trading prompt does **not**.
- [ ] **Perception** — a large tool output is compressed with a `⟦cortex: … compressed⟧` marker and
      a `cat .cortex-cache/<id>.txt` pointer to the verbatim original (needs a fast ollama backend;
      inert/no-op under a slow local model is expected, not a bug).
- [ ] **Sub-agent handoff** — spawning a `Task`/`Agent` prepends `.cortex/handoff.md` to its prompt.

## 4. Graceful degradation (cooperate-not-replace)

- [ ] **No Bun** → every hook no-ops (`command -v bun` guard); native Claude Code unaffected.
- [ ] **No ollama** → memory still works FTS-only; compression/consolidation degrade to no-op.
- [ ] **`CORTEX_ENABLED=0`** (or `enabled: false`) → cortex stays silent everywhere.
- [ ] A human-authored `.cortex/handoff.md` (no cortex marker) is **never** overwritten.
