# cortex — Roadmap & Project Tracker

> **Plugin name:** `cortex` ✅  ·  **Marketplace:** `claude-smartwork`  ·  **Install:** `/plugin install cortex@claude-smartwork`
> **Last updated:** 2026-06-15  ·  **License:** BUSL-1.1 (→ Apache-2.0 on 2030-06-15)
> **Status:** 🔨 Sprints 0–1 done & verified · **Sprint 2 closed** — S2-T1..T4 ✅ (detect→route→compress→cache→replace, 30/30 gate), S2-T5 🔄 (savings computed in-hook; stats store deferred to S3-T6). Live-LLM pass + latency review DONE: with a local 3B model (`qwen2.5:3b` ~33 tok/s) compression is generation-bound and **inert under the 15s sync cap** — safe (no-op), but real wins need a faster/off-path backend (sync cap now config-tunable via `perception.timeoutMs`). · **Sprint 3 (Expression) core built + gated** — EN/TH terse rulesets (lite/full/ultra), lang auto-detect, SessionStart inject + UserPromptSubmit reinforce, auto-clarity off-switch; `scripts/expression-test.ts` 28/28. Pending: S3-T6 control skill + `cortex-stats`, and live-CC injection capture.

A single **always-on** Claude Code plugin whose core mechanism is **lifecycle hooks**. It gives the agent a **human-brain-like** memory + cognition model and cuts tokens via an **embedded LLM (ollama, local or cloud)** — the "subconscious."

> **★ Guiding principle — cooperate, don't replace.** cortex **amplifies** Claude Code's native faculties (CLAUDE.md, native context management/compaction, native memory, native reasoning) so they run more *efficiently* together. It layers on top and defers to native behavior; it never overrides or fights it.

---

## 1. Vision — the brain model

**Amplifies** (does not replace) native memory & thinking, via five faculties wired into the lifecycle (not just on-demand):

```
┌──────────────────────────────────────────────────────────────────┐
│                    CORTEX  (claude-code brain)                     │
├──────────────────────────────────────────────────────────────────┤
│ 👁  PERCEPTION  — working memory / sensory filter                  │
│     PostToolUse → ollama compresses large tool outputs/files/logs  │
│     BEFORE Claude reads them.            [headroom-inspired, fresh] │
├──────────────────────────────────────────────────────────────────┤
│ 🗣  EXPRESSION  — speech                                           │
│     SessionStart + UserPromptSubmit → inject terse ruleset.        │
│     EN = caveman · TH = pordee · auto-detect.  [prompt-based]      │
├──────────────────────────────────────────────────────────────────┤
│ 🧠  MEMORY  — long-term (in-process lib, hook-driven)             │
│     • Episodic   : session events                                  │
│     • Semantic   : LLM-Wiki (distilled concepts, searchable)       │
│     • Core Memory: อริยสัจ4 error→cause→fix→path (anti-repeat)     │
│     Store: bun:sqlite (FTS5) + sqlite-vec · ollama embeddings      │
│     Consolidate (sleep): SessionEnd/PreCompact → ollama (+Haiku)   │
│     Recall (priming): SessionStart/UserPromptSubmit → inject       │
├──────────────────────────────────────────────────────────────────┤
│ 🧭  COGNITION  — thinking                                          │
│     • Critical Thinking + Wisdom(อภิธรรม)   [buddhist-method]      │
│     • Efficient Learning (extract lessons from sessions)           │
│     • karpathy-guidelines coding discipline                        │
│     Always-on inject + on-demand `cortex-think` skill              │
├──────────────────────────────────────────────────────────────────┤
│ 🌙  SUBCONSCIOUS  — embedded LLM (ollama)                          │
│     Local (OLLAMA_HOST) or Cloud (ollama.com).  Configurable model.│
│     Jobs: embeddings · read-compression · consolidation           │
│     Tiered accuracy: ollama (cheap) → escalate Claude Haiku        │
└──────────────────────────────────────────────────────────────────┘
```

**Maps to the 4 cognition pillars requested:**
| Pillar (user) | Faculty | อริยสัจ4 / อภิธรรม tie-in |
|---|---|---|
| Critical Thinking | Cognition | Yoniso/Kalāma (verify, root-cause) |
| Efficient Learning | Memory + Cognition | Core Memory consolidation |
| Wisdom mind (อภิธรรม) | Cognition | mind-state awareness / metacognition |
| Core Memory (ไม่ผิดซ้ำ) | Memory | อริยสัจ4: ทุกข์→สมุทัย→นิโรธ→มรรค |

### How each faculty cooperates with native Claude Code (not replace)
| Faculty | Native feature it works WITH | Cooperation contract |
|---|---|---|
| Perception | native compaction / context window | compress *before* context fills → native compaction triggers less often; reversible so native retrieval still works |
| Expression | native output | style layer only; auto-clarity yields to native verbosity when safety/clarity needs it |
| Memory | CLAUDE.md, native `/memory`, `.remember` | **augment** — store what CLAUDE.md shouldn't (episodic, embeddings, error-lessons); never overwrite CLAUDE.md; optionally *suggest* edits |
| Cognition | native reasoning | lightweight discipline nudges injected as context; never blocks or replaces the model's own reasoning |
| Subconscious | — | offloads cheap work to ollama so native Claude tokens go to high-value reasoning |

---

## 2. Locked decisions

| # | Decision | Choice |
|---|---|---|
| D0 | Stance | **Cooperate & amplify, NOT replace** — layer on native CLAUDE.md/compaction/memory/reasoning |
| D1 | Packaging | **One unified always-on plugin** (organized internally by faculty) |
| D2 | caveman/pordee/headroom source | **Reimplement fresh** (upstream MIT/Apache → attribute, no code copy) |
| D3 | Memory layer | **Build fresh**; ARRA *concept* only (ARRA is BUSL — no code reuse) |
| D4 | Vector store | **bun:sqlite + sqlite-vec + FTS5** (single file, no native build) |
| D5 | ollama jobs | embeddings + read-compression + consolidation + LLM-Wiki search (NOT terse-rewrite) |
| D6 | Consolidation accuracy | **Tiered**: ollama default → optional Claude escalation via the **`claude` CLI** (`claude -p --model`), reusing Claude Code's auth so a **subscription** works key-free (model configurable; supersedes the API-key Haiku plan) |
| D7 | caveman/pordee | stay **prompt/hook-based** (no LLM call) |
| D8 | Headroom | reimplement lightweight ollama-based read-compressor (not bundled) |
| D9 | Runtime | **Bun ≥ 1.2 + TypeScript** (no build; built-in SQLite). Hard prerequisite; graceful no-op if absent |
| D10 | Tech stack | Reuse ARRA's **packages only** (bun:sqlite, `drizzle-orm`, `sqlite-vec`, `ulidx`, `@modelcontextprotocol/sdk`) — **NOT** its full service architecture |
| D11 | Core mechanism | **Lifecycle hooks** drive everything; memory = **in-process lib** the hooks call directly. Elysia HTTP daemon + dashboard + thin MCP layer = **optional/deferred** |
| D12 | License | **BUSL-1.1** — source-available; concept reusable, code not reusable without reimplementation; converts to Apache-2.0 on 2030-06-15 |

## 3. Tech stack (ARRA packages, no service architecture — verify in Sprint 1)

- **Runtime:** **Bun ≥ 1.2** (TypeScript, no build; fast hook startup). If Bun absent → hooks no-op gracefully (never block native Claude Code).
- **Core mechanism:** Claude Code **lifecycle hooks** (`SessionStart`, `UserPromptSubmit`, `PostToolUse`, `PreCompact`, `SessionEnd`).
- **Memory store:** **`bun:sqlite`** (built-in) + **`sqlite-vec`** via `loadExtension()` + FTS5 — single file.
- **ORM/migrations:** **`drizzle-orm`** + `drizzle-kit`.
- **IDs:** **`ulidx`** (sortable ULIDs).
- **Embeddings:** ollama `nomic-embed-text` (default, configurable).
- **Compression model:** ollama small instruct (default `qwen2.5:3b` / `llama3.2:3b`, configurable).
- **Escalation:** Claude Haiku `claude-haiku-4-5` via Anthropic API (opt-in).
- **Config:** env vars + `.claude/cortex.local.md` (plugin-settings pattern), gitignored.
- **Optional / deferred:** **`elysia`** + `@elysiajs/cors` (HTTP dashboard / cross-agent), **`@modelcontextprotocol/sdk`** (thin MCP layer so Claude can query memory mid-task).
- **Portability:** all paths via `${CLAUDE_PLUGIN_ROOT}`; hooks invoked as `bun "..."` with a POSIX guard; graceful no-op if Bun/ollama absent.

> ⚠️ ARRA is **BUSL-1.1**: we adopt its *package list* (not copyrightable) but **reimplement all code**. No ARRA source is copied.

## 3b. Working conventions (binding for this project)

Mandated by repo `CLAUDE.md`; applied every sprint and surfaced inside cortex where they fit the product.

| Tool / standard | Upstream | Use in DEV (process) | Use in cortex (product) |
|---|---|---|---|
| **graphify** | https://github.com/safishamsi/graphify | Source discovery FIRST (KG over Grep/Glob/Read) | Cognition/Perception can call graphify for token-cheap code navigation |
| **karpathy-guidelines** | https://github.com/multica-ai/andrej-karpathy-skills | Coding standard for ALL changes: surgical/minimal-diff, surface assumptions, verifiable success criteria | Folded into Cognition faculty (S5-T6) |
| **buddhist-method** | reimplemented (see §6) | Critical-thinking discipline while building | Core of the Cognition faculty |

**Definition of Done (per task):** surgical diff · assumptions surfaced · success criteria stated & verified · graphify used for discovery where applicable.

---

## 4. Milestones → Sprints → Tasks

**Status legend:** ⬜ todo · 🔄 in-progress · ✅ done · ⏸ blocked · ❎ cut

### M0 / Sprint 0 — Foundation & Scaffolding  ✅
Goal: installable skeleton + config on a Bun base.
- [x] ✅ S0-T1 Plugin name `cortex` confirmed + `.claude-plugin/plugin.json`
- [x] ✅ S0-T2 Skeleton: `lib/`, manifest, `package.json` (Bun/ESM), `tsconfig.json`; component dirs per-sprint
- [x] ✅ S0-T3 `cortex` entry added to root `marketplace.json` (`source: ./cortex`)
- [x] ✅ S0-T4 `lib/config.ts` — env + `.claude/cortex.local.md` resolution; defaults
- [x] ✅ S0-T5 `.gitignore` — `*.local.md`, memory db, caches
- [x] ✅ S0-T6 README skeleton (install, prerequisites, brain-model, attribution)
- [x] ✅ S0-T7 LICENSE → BUSL-1.1

### M1 / Sprint 1 — Subconscious (embedded LLM / ollama)  ✅
Goal: reliable ollama bridge, local + cloud, with fallback.
- [x] ✅ S1-T1 Verified Bun stack on macOS: `bun:sqlite` + `sqlite-vec` `loadExtension` (needs `Database.setCustomSQLite('/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib')` — bundled sqlite has extension loading OFF) + vec0 KNN + FTS5; ollama embed dims confirmed (**dims are model-bound: nomic=768, qwen3=4096 → vec schema must read dims dynamically, Sprint 4**); dep provisioning = `bun add sqlite-vec` → platform `vec0.dylib`. *Decision deferred to S4: ship a libsqlite3 detect+fallback (FTS-only) path for non-Homebrew machines.*
- [x] ✅ S1-T2 `lib/ollama.ts` — chat + embeddings, `OLLAMA_HOST` (local) & cloud (`OLLAMA_API_KEY` Bearer)
- [x] ✅ S1-T3 Model config (embed/compress) overridable (env + `cortex.local.md`)
- [x] ✅ S1-T4 Health check + **graceful degradation** (every export → null/false on any failure, never throws; SKIP path proven in smoke test)
- [x] ✅ S1-T5 `lib/escalate.ts` — optional Claude escalation via the **`claude` CLI** (`claude -p --model <m>`), reuses Claude Code auth so a **Pro/Max subscription works with no API key** (D0 cooperate-not-replace); model configurable (`sonnet`/`opus`/`haiku`/`claude-*`). *(Supersedes the original API-key `lib/haiku.ts` plan.)*
- [x] ✅ S1-T6 Smoke test (`bun run smoke`): health + embed (dims=4096) + compress + escalation (`cortex-ok` via CLI) all proven live. Also fixed Sprint-0 typecheck gate (`@types/bun` dev-dep; gitignored).

### M2 / Sprint 2 — Perception (read-side token optimize)  🔄
Goal: compress what Claude reads before it hits context.
- [x] ✅ S2-T1 PostToolUse hook: detect large outputs over threshold. **Blocker resolved — mechanism verified live (CC 2.1.177):** a PostToolUse hook *replaces* the result Claude reads via `hookSpecificOutput.updatedToolOutput`; the value MUST match the tool's native `tool_response` shape (Bash = `{stdout,stderr,interrupted,isImage,noOutputExpected}`) — a **bare string is silently ignored**, so swap only the text field and keep the rest. Shipped: `hooks/hooks.json` (matcher `Bash`, POSIX `command -v bun` guard + `|| true`), `hooks/perception-posttooluse.ts` (stdin→detect→**safe no-op**; the `updatedToolOutput` replacement seam awaits S2-T3 compress + S2-T4 cache), `lib/perception.ts` (pure per-tool adapter registry; Bash mapped). Verified: typecheck clean · over-threshold detect + empty-stdout no-op · small/unmapped-tool no-op · rebuild immutability · e2e hook fires with **bun on the hook PATH** (CC passes the full interactive PATH).
  - *Carry-forward:* (a) extend `ADAPTERS` per tool in S2-T2 as each `tool_response` shape is confirmed (Read/Grep/WebFetch next — verify shapes the same way). (b) bun-PATH guard works when CC is launched from a shell that has `~/.bun/bin`; for GUI/other launches consider probing common bun paths before declaring absent. (c) **Test lesson:** headless e2e must use *unpredictable* output (e.g. `$RANDOM`) — the model parrots predictable answers (`seq 1 2000`→`2000`) without invoking the tool, so the hook never fires and the test silently lies.
- [x] ✅ S2-T2 Content router — `lib/router.ts` (pure: classify json/code/prose via JSON.parse + code-line density; misclassification only costs ratio, never correctness — guardrail is the safety net). Extended `lib/perception.ts` `ADAPTERS` to **Read** (`file.content`, guarded by `type==="text"`) and **Grep** (`content`, only `mode==="content"`); shapes **captured live** (not guessed). **Glob deliberately skipped** (payload is a path array → would violate "never drop a path", near-zero token gain). Hook matcher widened `Bash` → `Bash|Read|Grep`.
- [x] ✅ S2-T3 ollama compression — `lib/compress.ts`: per-content-type prompts via `chat()` with a **tight 15s timeout** (vs chat's 60s default — PostToolUse is synchronous). **Post-compression guardrail** is the real safety net: `criticalTokens()` extracts URLs / absolute paths / 7+hex hashes / 3+digit numbers from the ORIGINAL, and `preservesCritical()` rejects (→ null → no-op) if the model dropped ANY of them. `chatFn` injection seam for deterministic tests. Any failure (down/slow/empty/guardrail) → null → original untouched.
- [x] ✅ S2-T4 Reversible cache (primitive) — `lib/cache.ts`: `cacheOriginal()` writes the verbatim original to `.cortex-cache/<sha256-16>.txt` (idempotent; project-relative pointer). The hook **replaces only after the cache write succeeds** (reversibility gate). Retrieval UX = inline marker `⟦cortex: <kind> output compressed … verbatim original: cat .cortex-cache/<id>.txt⟧` — no new skill needed, Claude just `cat`s it.
- [~] 🔄 S2-T5 Per-turn savings accounting — partial: savings are computed in-hook (`MAX_RATIO 0.9` gate + `saved chars` debug line; replace only if meaningfully smaller). **Persisting to a stats store is deferred** (feeds the future `cortex-stats` in S3-T6).
  - **Verified (gate, not smoke):** typecheck clean · `scripts/perception-test.ts` **30/30 assertions** — router (6), guardrail/criticalTokens (6), compress mock good/drop/empty/null (4) + tunable-timeout default (1), cache round-trip + idempotent (5), **full hook e2e via a fake ollama HTTP server** (8: valid JSON, correct `hookEventName`, cortex marker, summary present, cat-able pointer, other Bash keys preserved, cached file == verbatim original, under-threshold → empty stdout). Real-failure path proven live: cloud `glm-5.1:cloud` → **HTTP 403** → `chat()` null → `compress()` null → hook no-op.
  - **✅ live-LLM pass RUN** (`scripts/perception-live.ts`, a diagnostic like `smoke.ts` — pulls `qwen2.5:3b`, hits real `/api/chat`, reports ratio + guardrail + latency; SKIPs + exits 0 without a model). **Finding (real, not tuning):** at ~33 tok/s the model is **generation-bound** (wall ≈ output_tokens/33; prompt-eval is ~10× faster). On real payloads: **code 12.7KB → 113s, output ≈100% (no compression** — "preserve everything" makes it regurgitate dense source); **json 13KB → 110s, 85% (barely beats the 0.9 gate); prose 2.5KB → 19.3s, 75% ✅**. Net: only redundant prose/log content compresses, and **even that needs ~19s — over the 15s sync cap**, so with this model the live result is **100% no-op (safe but inert)**. `num_predict` caps truncate the good cases and don't beat the wall, so knob-tuning can't fix it.
  - **✅ latency review DONE — structural verdict:** synchronous in-hook compression with a local 3B model can't net a win under any sane sync budget (generation throughput × budget is the wall). Shipped the one honest knob: **`perception.timeoutMs` is now config-tunable** (`compress.ts` reads it; default 15000) — lower it to fail fast on slow backends, raise it only with a faster backend. Real value (large outputs) needs **a faster/GPU-backed compression model, or moving compression OFF the synchronous path** (async/background) — logged as the S2 follow-up, not a blocker (cooperate-not-replace = inert is harmless).
  - *Carry-forward:* (c) Grep `rebuild` leaves `numLines` stale after compression (metadata only; Claude reads `content`). (d) **WebFetch** adapter still unmapped — capture its `tool_response` shape the same empirical way before adding. (e) **Async/off-path compression** is the real unlock for large outputs — design in a later sprint.

### M3 / Sprint 3 — Expression (speak-side token optimize)  🔄
Goal: terse output, EN+TH, always-on. **Core (T1–T5) built + gated; T6 + live-CC capture pending.**
All rulesets are ORIGINAL reimplementations of caveman (EN) / pordee (TH) behavior — same outcome, own wording; reference BUSL source never copied.
- [x] ✅ S3-T1 caveman-style EN ruleset (`lib/expression.ts`, pure) — `lite` (cut filler/hedging, keep articles), `full` (drop articles, fragments, short synonyms, no narration/decoration), `ultra` (abbreviate PROSE words only — never code symbols/fn/API names — causality arrows). Preserve-core: code/paths/URLs/identifiers/errors/commit-keywords verbatim, reply in user's language, never announce the mode.
- [x] ✅ S3-T2 pordee-style TH ruleset — `lite` (drop ครับ/ค่ะ/นะคะ, hedges อาจจะ/น่าจะ, pleasantries; grammar intact) + `full` (lite + drop redundant particles ที่/ซึ่ง/ว่า, drop การ-/ความ- nominalizers, terse swaps เนื่องจาก→เพราะ …). Keeps EN technical terms. `ultra` folds to `full` (TH ships lite/full).
- [x] ✅ S3-T3 Language auto-detect — `detectLang()` (Thai Unicode block → `th`, else `en`; mixed EN+TH → th). UserPromptSubmit picks the ruleset per turn; `expression.lang` config (`auto`|`en`|`th`, default auto) can pin it.
- [x] ✅ S3-T4 Inject + reinforce — `hooks/expression-sessionstart.ts` writes the standing ruleset to **stdout = session context**; `hooks/expression-userpromptsubmit.ts` emits a per-turn anchor via **`hookSpecificOutput.additionalContext`**. Hook output shapes **grounded in caveman's shipping CC hooks** (factual CC API, not copied logic). Runtime mode flag `lib/exprmode.ts` (`.cortex-expression` in config dir; whitelist-validated on read; `off`/`lite`/`full`/`ultra`) lets `/cortex …` override config and persist between hooks. `hooks.json` now wires SessionStart + UserPromptSubmit + PostToolUse.
  - **✅ live-CC injection capture VERIFIED** (headless `claude -p --settings` probe, unique random markers): the model quoted BOTH injected tokens, proving **SessionStart plain stdout** and **UserPromptSubmit `additionalContext`** reach the model's context in CC 2.1.177. (The probe model *refused* to obey the adversarial "emit token" directive — correct security hygiene; cortex's real ruleset is benign opt-in style guidance, so it won't trip that refusal.)
- [x] ✅ S3-T5 Auto-clarity — split: the **response-side** drop (security/irreversible/multi-step) is a self-instruction inside every ruleset; the **user-side** `needsClarity()` detects confusion ("ไม่เข้าใจ"/"งง"/"say again") or a pasted destructive command (`rm -rf`, `drop table`, `--force`) in the prompt → UPS stays silent that turn (normal prose).
  - **Verified (gate):** typecheck clean · `scripts/expression-test.ts` **28/28** — lang detect (3), auto-clarity (4), rulesets per lang+mode (8), override flag round-trip + resolve (5), **both hooks e2e spawned with an isolated `CLAUDE_CONFIG_DIR`** (8: SessionStart auto/fixed-lang stdout, UPS TH/EN reinforcement, auto-clarity silence, `/cortex off` flag write + subsequent silence). Perception gate still 30/30 (no regression).
- [ ] ⬜ S3-T6 `cortex` control skill (on/off/level/status) + `cortex-stats` — flag plumbing exists (`/cortex off|lite|full|ultra` handled in UPS); the SKILL.md control surface + stats reporting are the remaining build.

### M4 / Sprint 4 — Memory (long-term, human-brain, in-process)  ⬜  ★ core
Goal: persistent episodic + semantic + Core Memory with recall & consolidation — in-process lib called by hooks.
- [ ] ⬜ S4-T1 Drizzle schema: episodic / semantic (LLM-Wiki) / core_memory (+ FTS5 + vec tables) on bun:sqlite
- [ ] ⬜ S4-T2 `lib/memory.ts` in-process: commit/recall (hybrid FTS + vector), ollama embeddings, ulid ids
- [ ] ⬜ S4-T3 **Core Memory (อริยสัจ4)** model: ทุกข์(error)→สมุทัย(cause)→นิโรธ(fixed)→มรรค(fix path) + dedup
- [ ] ⬜ S4-T4 LLM-Wiki: distilled concept pages, searchable
- [ ] ⬜ S4-T5 Recall hook (SessionStart/UserPromptSubmit) → inject relevant memories + lessons
- [ ] ⬜ S4-T6 Consolidation hook (SessionEnd/PreCompact) → ollama (+Haiku) → write memory
- [ ] ⬜ S4-T7 `cortex-recall` + `cortex-remember` skills
- [ ] ⬜ S4-T8 *(optional)* thin MCP layer (`memory_recall`/`memory_commit`/`wiki_search`) via `.mcp.json`

### M5 / Sprint 5 — Cognition (thinking)  ⬜
Goal: critical thinking + wisdom + efficient learning, always-on.
- [ ] ⬜ S5-T1 Reimplement buddhist-method (6 principles) as injected discipline
- [ ] ⬜ S5-T2 Add Wisdom/อภิธรรม layer (mind-state awareness / metacognition)
- [ ] ⬜ S5-T3 Efficient Learning: lesson extraction tied to consolidation
- [ ] ⬜ S5-T4 SessionStart inject thinking discipline (lightweight, token-aware)
- [ ] ⬜ S5-T5 `cortex-think` skill (deep reasoning on demand)
- [ ] ⬜ S5-T6 Fold **karpathy-guidelines** coding discipline into cognition
- [ ] ⬜ S5-T7 **graphify** integration: prefer KG discovery → cheaper code navigation
- [x] ✅ S5-T8 **Sub-agent delegation handoff** (user-requested, pulled forward) — a **PreToolUse** hook on `Task`/`Agent` prepends a project handoff to the sub-agent's `prompt` so it inherits scope instead of starting cold. Mechanism **`hookSpecificOutput.updatedInput`** (verified live: RTK's rewrite hook uses it on this CC version; emitted WITHOUT `permissionDecision` so we augment input but never override the spawn-permission flow). `lib/handoff.ts` reads `.cortex/handoff.md` (walk-up, 8KB cap, missing → no-op); `hooks/cognition-pretooluse.ts`; `config.cognition.enabled` + `CORTEX_COGNITION`. Gate `scripts/cognition-test.ts` **13/13** (readHandoff/compose + hook e2e: Task→updatedInput carries handoff+task & preserves other fields, no-file/non-Task/no-prompt → no-op).
  - *Carry-forward:* (1) handoff is **manually maintained** in `.cortex/handoff.md` for now → **Memory faculty (S4) will auto-write it** from session state. (2) live Task-spawn end-to-end capture (does the sub-agent actually receive the rewritten prompt) is the final confirmation — low risk (RTK proves `updatedInput` live, same event/field).

### M6 / Sprint 6 — Integration, Validation, Docs  ⬜
Goal: wire everything, validate, publish.
- [ ] ⬜ S6-T1 *(optional)* Elysia HTTP dashboard + cross-agent shared store
- [ ] ⬜ S6-T2 End-to-end lifecycle wiring + conflict checks across hooks
- [ ] ⬜ S6-T3 `plugin-validator` agent pass + fix
- [ ] ⬜ S6-T4 `skill-reviewer` pass on each skill
- [ ] ⬜ S6-T5 Full README + config templates + attribution (caveman/pordee/headroom/arra/buddhist + graphify/karpathy)
- [ ] ⬜ S6-T6 Local install test (`claude --plugin-dir`) + verification checklist
- [ ] ⬜ S6-T7 Bump version, finalize `marketplace.json`, publish notes

---

## 5. Open questions / risks
- ❓ **Bun availability** — hard prerequisite; mitigated by graceful no-op + one-line install. Verify hook guard when Bun absent (S1)
- ❓ **Dep provisioning** — `drizzle-orm`/`sqlite-vec`/`ulidx` must be available in the installed plugin cache; decide `bun install` on first run vs Bun auto-install (S1-T1)
- ❓ **Latency** — PostToolUse ollama compression adds wall-clock; need async/threshold tuning (S2)
- ⚠️ **License** — BUSL-1.1: display LICENSE conspicuously; still **reimplement** (never copy ARRA's BUSL source); preserve upstream MIT/Apache attribution

## 6. Attribution & references (required in README)
Reimplemented patterns inspired by (patterns only, no source copied):
- **caveman** (MIT, J. Brussee) — output compression EN — https://github.com/JuliusBrussee/caveman
- **pordee** (MIT) — output compression TH
- **headroom** (Apache-2.0) — read-side compression — https://github.com/chopratejas/headroom
- **buddhist-method** (MIT) — critical-thinking discipline
- **arra-oracle-v3** (BUSL-1.1 — *concept + package list only, no code*) — memory stack — https://github.com/Soul-Brews-Studio/arra-oracle-v3

Working tooling / standards adopted:
- **graphify** — https://github.com/safishamsi/graphify
- **andrej-karpathy-skills** (karpathy-guidelines) — https://github.com/multica-ai/andrej-karpathy-skills
