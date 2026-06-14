# pordee-stats + Benchmark Pipeline — Design Spec

**Date:** 2026-05-10
**Author:** Vatunyoo Suwannapisit
**Status:** Approved

---

## 1. Overview

### 1.1 What

`pordee-stats` is a token-usage reporter for the pordee plugin, modeled after `caveman-stats.js`. It reads Claude Code session logs, calculates output tokens, and estimates token savings using a **median compression ratio** derived from live API benchmark runs.

The benchmark script (`benchmarks/run.js`) runs a suite of dedicated Thai dev prompts through the Anthropic API twice per prompt — once in normal mode, once in pordee mode — measures output token counts, computes per-prompt compression ratios, and generates a median lookup table.

### 1.2 Why

Caveman hardcodes `COMPRESSION = { full: 0.65 }` from a single past benchmark. Pordee needs data-driven compression values that:
- Reflect actual Thai-language compression (different from English caveman)
- Update automatically when the benchmark is re-run
- Use **median** instead of mean to resist outlier prompts

### 1.3 Non-goals

- No integration with caveman's benchmark infrastructure. Pordee is independent.
- No caching of API responses. Each benchmark run is fresh.
- No automatic periodic benchmarking. Manual trigger only.

---

## 2. Architecture

### 2.1 File layout

```
pordee/
├── benchmarks/
│   ├── run.js                  # API benchmark runner (Node.js)
│   ├── prompts.json            # 8 dedicated Thai dev prompts
│   ├── results/                # per-run JSON files (gitignored)
│   └── compression.json        # auto-generated median lookup
├── hooks/
│   ├── pordee-stats.js         # stats reporter (based on caveman-stats.js)
│   └── pordee-mode-tracker.js  # extended with /pordee-stats trigger
└── tests/
    └── test_pordee_stats.js    # tests for stats + benchmark
```

### 2.2 Data flow

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────────┐
│ prompts.json    │────→│ benchmarks/  │────→│ results/<ts>.json   │
│ (8 Thai prompts)│     │ run.js       │     │ (per-prompt detail) │
└─────────────────┘     └──────────────┘     └─────────────────────┘
                                                    │
                                                    ▼
                                           ┌─────────────────────┐
                                           │ compression.json    │
                                           │ (median lookup)     │
                                           └─────────────────────┘
                                                    │
                                                    ▼
                                           ┌─────────────────────┐
                                           │ pordee-stats.js     │
                                           │ (reads at runtime)  │
                                           └─────────────────────┘
```

### 2.3 Benchmark runner

`benchmarks/run.js` is a Node.js CLI script that:

1. Reads `benchmarks/prompts.json`
2. For each prompt, calls Anthropic API twice:
   - **Normal:** generic system prompt (`"You are a helpful assistant"`)
   - **Pordee:** pordee ruleset injected via system prompt
3. Records `output_tokens` from each response
4. Computes compression ratio: `(normal_tokens - pordee_tokens) / normal_tokens`
5. Saves full results to `benchmarks/results/<ISO-timestamp>.json`
6. Computes median ratio per level, writes to `benchmarks/compression.json`

**CLI:** `node benchmarks/run.js [--level full|lite] [--model <model-id>]`

**Requirements:** `ANTHROPIC_API_KEY` env var. Script exits with clear error if missing.

### 2.4 pordee-stats

`hooks/pordee-stats.js` is based on `caveman-stats.js` with these adaptations:

| Feature | caveman-stats | pordee-stats |
|---|---|---|
| Compression source | Hardcoded `COMPRESSION = { full: 0.65 }` | Reads `benchmarks/compression.json` at runtime |
| Branding | "Caveman Stats" + 🪨 | "พอดี Stats" + ⚡ |
| History file | `~/.caveman/.caveman-history.jsonl` | `~/.pordee/history.jsonl` |
| State source | `~/.caveman/.caveman-active` flag | `~/.pordee/state.json` (`enabled` + `level`) |
| Mode values | `full`, `lite`, `ultra`, `wenyan` | `full`, `lite` only |

**Preserved features:** `--session-file`, `--share`, `--all`, `--since`, lifetime aggregation, USD cost estimate, statusline suffix, humanizeTokens.

**Fallback:** If `compression.json` is missing, stats output shows:
```
No benchmark data. Run `node benchmarks/run.js` first.
```

---

## 3. Result File Schemas

### 3.1 Per-run result (`results/<timestamp>.json`)

```json
{
  "timestamp": "2026-05-10T12:00:00Z",
  "model": "claude-sonnet-4-7",
  "level": "full",
  "prompts": [
    {
      "id": "jwt-auth",
      "prompt": "อธิบายวิธีทำ authentication ด้วย JWT ใน Node.js",
      "normal_tokens": 450,
      "pordee_tokens": 180,
      "ratio": 0.60
    }
  ],
  "summary": {
    "median_ratio": 0.58,
    "mean_ratio": 0.59,
    "min_ratio": 0.45,
    "max_ratio": 0.72,
    "count": 8
  }
}
```

### 3.2 Compression lookup (`compression.json`)

Auto-generated from the latest benchmark run. Read by `pordee-stats.js` at runtime.

```json
{
  "generated_at": "2026-05-10T12:00:00Z",
  "model": "claude-sonnet-4-7",
  "compression": {
    "full": 0.58,
    "lite": 0.42
  },
  "source_run": "2026-05-10T12:00:00Z"
}
```

---

## 4. Benchmark Prompts

Dedicated Thai dev prompts designed to produce substantial responses (300–800 tokens in normal mode) so compression ratios are meaningful.

| # | ID | Prompt |
|---|---|---|
| 1 | `jwt-auth` | อธิบายวิธีทำ authentication ด้วย JWT ใน Node.js |
| 2 | `slow-query` | ทำไม database query ช้า มีวิธี optimize ไหม |
| 3 | `rest-api` | สร้าง REST API ด้วย Express ที่มี CRUD สำหรับ user |
| 4 | `redis-vs-memcached` | เปรียบเทียบ Redis กับ Memcached ควรใช้ตัวไหน |
| 5 | `react-memory-leak` | แก้ไข memory leak ใน React component ยังไง |
| 6 | `event-loop` | อธิบายเรื่อง event loop ใน Node.js |
| 7 | `docker-compose` | ตั้งค่า Docker Compose สำหรับ PostgreSQL + Redis |
| 8 | `typescript-why` | ทำไมต้องใช้ TypeScript แทน JavaScript |

Each prompt covers a different domain (auth, DB, API, caching, frontend, runtime, infra, language) to ensure the median is representative.

---

## 5. Hook Integration

`pordee-mode-tracker.js` is extended with a `/pordee-stats` trigger, following the same pattern as caveman's `/caveman-stats`:

- User types `/pordee-stats` → mode tracker detects trigger
- Runs `pordee-stats.js` with `--session-file <transcript_path>`
- Emits stats as `decision: block` with formatted output in `reason`
- Flag preserved (same as caveman behavior)

Also supports `/pordee-stats --share` for single-line summary.

---

## 6. Testing

Use Node's built-in test runner (`node --test`).

### 6.1 `tests/test_pordee_stats.js`

- Reads `--session-file` directly and sums output tokens
- Shows savings estimate when compression.json has data for current level
- Skips estimate when level has no benchmark data
- Reports no-session when no .jsonl exists
- `--share` prints single-line tweetable summary
- Appends to lifetime history on each run
- `--all` aggregates latest entry per session
- `--since` filters by time window
- `--since` rejects malformed durations
- Computes median correctly from result files
- Falls back gracefully when compression.json missing

### 6.2 `tests/test_benchmark.js`

- Mock API responses (no real API calls in tests)
- Computes compression ratio correctly
- Generates valid `results/<ts>.json` schema
- Generates valid `compression.json` schema
- Median calculation handles odd/even counts

---

## 7. Acceptance Criteria

- [ ] `node benchmarks/run.js` runs all 8 prompts, produces valid `results/*.json` and `compression.json`
- [ ] `node hooks/pordee-stats.js` reads session file, shows token usage + savings estimate
- [ ] Median compression value used in savings calculation (not mean)
- [ ] `--share` produces single-line summary
- [ ] `--all` and `--since` aggregate lifetime history
- [ ] Graceful fallback when `compression.json` missing
- [ ] `/pordee-stats` trigger works via mode tracker
- [ ] All tests pass on `node --test`
- [ ] No real API calls during test runs (mocked)

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| API calls cost money | 8 prompts × 2 modes = 16 calls. At ~$15/M output tokens, cost is ~$0.05–0.20 per run. Document clearly. |
| Benchmark results vary across model versions | `compression.json` includes `model` field. Re-run benchmark after model updates. |
| Thai tokenization differs from English | Use Anthropic API's native `output_tokens` count (same as session logs). No external tokenizer needed. |
| `compression.json` out of sync with results | Script regenerates `compression.json` on every run. No manual editing needed. |

---

## 9. References

- `caveman-stats.js`: `D:/projects/caveman/hooks/caveman-stats.js`
- Original pordee design: `docs/superpowers/specs/2026-05-07-pordee-design.md`
- Anthropic API docs: https://docs.anthropic.com/en/api/messages
