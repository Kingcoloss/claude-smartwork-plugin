# cortex — install & verification checklist

Run before publishing or after a local install. Two layers: **automated** (deterministic, no
network) and **manual** (a real Claude Code session, observing each faculty).

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

## 2. Manual — local install

Dev install (no marketplace round-trip):

```bash
claude --plugin-dir /absolute/path/to/cortex
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
