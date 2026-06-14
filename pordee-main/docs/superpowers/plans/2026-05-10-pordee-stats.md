# pordee-stats + Benchmark Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `pordee-stats` token reporter (based on `caveman-stats.js`) with median compression from live API benchmarks, plus a Node.js benchmark runner with Thai dev prompts.

**Architecture:** Benchmark runner calls Anthropic API twice per prompt (normal vs pordee mode), saves per-run results to `benchmarks/results/`, and writes median lookup to `benchmarks/compression.json`. `pordee-stats.js` reads that lookup at runtime to estimate savings. Mode tracker extended with `/pordee-stats` trigger.

**Tech Stack:** Node.js 18+ (built-in `fetch`), no external dependencies. Test runner: `node --test`.

---

## File Map

| File | Responsibility |
|---|---|
| `benchmarks/prompts.json` | 8 Thai dev prompts for benchmark suite |
| `benchmarks/run.js` | API benchmark runner: calls Claude twice per prompt, computes ratios, saves results + compression.json |
| `hooks/pordee-stats.js` | Stats reporter: reads session logs, computes token usage + savings using compression.json |
| `tests/test_benchmark.js` | Tests for benchmark runner (mocked API, --dry-run) |
| `tests/test_pordee_stats.js` | Tests for pordee-stats (session parsing, savings, aggregation, history) |
| `hooks/pordee-mode-tracker.js` | Extended with `/pordee-stats` trigger handling |

---

### Task 1: Benchmark Prompts JSON

**Files:**
- Create: `benchmarks/prompts.json`

- [ ] **Step 1: Create prompts file**

```json
[
  { "id": "jwt-auth", "prompt": "อธิบายวิธีทำ authentication ด้วย JWT ใน Node.js" },
  { "id": "slow-query", "prompt": "ทำไม database query ช้า มีวิธี optimize ไหม" },
  { "id": "rest-api", "prompt": "สร้าง REST API ด้วย Express ที่มี CRUD สำหรับ user" },
  { "id": "redis-vs-memcached", "prompt": "เปรียบเทียบ Redis กับ Memcached ควรใช้ตัวไหน" },
  { "id": "react-memory-leak", "prompt": "แก้ไข memory leak ใน React component ยังไง" },
  { "id": "event-loop", "prompt": "อธิบายเรื่อง event loop ใน Node.js" },
  { "id": "docker-compose", "prompt": "ตั้งค่า Docker Compose สำหรับ PostgreSQL + Redis" },
  { "id": "typescript-why", "prompt": "ทำไมต้องใช้ TypeScript แทน JavaScript" }
]
```

- [ ] **Step 2: Create benchmarks directory**

Run: `mkdir -p benchmarks/results`

- [ ] **Step 3: Commit**

```bash
git add benchmarks/prompts.json
git commit -m "feat(benchmark): add 8 Thai dev prompts for compression benchmark"
```

---

### Task 2: Benchmark Runner Script

**Files:**
- Create: `benchmarks/run.js`

- [ ] **Step 1: Write benchmark runner**

```javascript
#!/usr/bin/env node
// pordee benchmark — run Thai prompts through Anthropic API twice per prompt
// (normal mode vs pordee mode), compute compression ratios, save results.
//
// Usage: node benchmarks/run.js [--level full|lite] [--model <id>] [--dry-run]

const fs = require('fs');
const path = require('path');

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

function loadPrompts() {
  const promptsPath = path.join(__dirname, 'prompts.json');
  return JSON.parse(fs.readFileSync(promptsPath, 'utf8'));
}

function makeSystemPrompt(level) {
  if (level === 'lite') {
    return 'Respond in Thai. Drop polite particles (ครับ, ค่ะ, นะคะ, นะครับ), hedging (อาจจะ, น่าจะ), and pleasantries (ได้เลยครับ, แน่นอน). Keep technical English terms. Keep grammar intact.';
  }
  return 'Respond terse like simple Thai. Keep technical English terms. Drop polite particles (ครับ, ค่ะ, นะคะ, นะครับ), hedging (อาจจะ, น่าจะ, จริงๆแล้ว), pleasantries (ได้เลยครับ, แน่นอน), and English-style filler (just/really/basically/actually/simply). Fragments OK. Use short Thai synonyms (ดู not ตรวจสอบ, แก้ not ทำการแก้ไข, เพราะ not เนื่องจาก).';
}

async function callAPI(prompt, systemPrompt, model, apiKey) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }
  const data = await response.json();
  return {
    tokens: data.usage.output_tokens,
    content: data.content[0].text,
  };
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function runBenchmark(prompts, level, model, apiKey, dryRun = false) {
  const normalSystem = 'You are a helpful assistant. Respond in Thai.';
  const pordeeSystem = makeSystemPrompt(level);
  const results = [];

  for (const { id, prompt } of prompts) {
    let normalTokens, pordeeTokens;

    if (dryRun) {
      const base = id.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
      normalTokens = 300 + (base % 400);
      pordeeTokens = Math.floor(normalTokens * (0.3 + (base % 20) / 100));
    } else {
      const normalResult = await callAPI(prompt, normalSystem, model, apiKey);
      const pordeeResult = await callAPI(prompt, pordeeSystem, model, apiKey);
      normalTokens = normalResult.tokens;
      pordeeTokens = pordeeResult.tokens;
    }

    const ratio = normalTokens > 0 ? (normalTokens - pordeeTokens) / normalTokens : 0;
    results.push({ id, prompt, normal_tokens: normalTokens, pordee_tokens: pordeeTokens, ratio });
  }

  const ratios = results.map(r => r.ratio);
  return {
    timestamp: new Date().toISOString(),
    model,
    level,
    prompts: results,
    summary: {
      median_ratio: median(ratios),
      mean_ratio: mean(ratios),
      min_ratio: Math.min(...ratios),
      max_ratio: Math.max(...ratios),
      count: results.length,
    },
  };
}

function saveResults(result) {
  const resultsDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const filename = result.timestamp.replace(/[:.]/g, '-') + '.json';
  const filepath = path.join(resultsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
  return filepath;
}

function updateCompressionJson(result) {
  const compressionPath = path.join(__dirname, 'compression.json');
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(compressionPath, 'utf8'));
  } catch {
    // File missing or invalid — start fresh
  }

  const compression = {
    ...(existing.compression || {}),
    [result.level]: result.summary.median_ratio,
  };

  const updated = {
    generated_at: result.timestamp,
    model: result.model,
    compression,
    source_run: result.timestamp,
  };

  fs.writeFileSync(compressionPath, JSON.stringify(updated, null, 2));
  return compressionPath;
}

async function main() {
  const args = process.argv.slice(2);
  const levelIdx = args.indexOf('--level');
  const level = levelIdx !== -1 ? args[levelIdx + 1] : 'full';
  const modelIdx = args.indexOf('--model');
  const model = modelIdx !== -1 ? args[modelIdx + 1] : 'claude-sonnet-4-7';
  const dryRun = args.includes('--dry-run');

  if (!['full', 'lite'].includes(level)) {
    process.stderr.write(`Invalid level: ${level}. Use 'full' or 'lite'.\n`);
    process.exit(2);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !dryRun) {
    process.stderr.write('ANTHROPIC_API_KEY not set. Set it or use --dry-run.\n');
    process.exit(1);
  }

  const prompts = loadPrompts();
  const result = await runBenchmark(prompts, level, model, apiKey, dryRun);
  const resultsPath = saveResults(result);
  const compressionPath = updateCompressionJson(result);

  process.stdout.write(`Benchmark complete.\n`);
  process.stdout.write(`Results: ${resultsPath}\n`);
  process.stdout.write(`Compression: ${compressionPath}\n`);
  process.stdout.write(`Median ${level} compression: ${(result.summary.median_ratio * 100).toFixed(1)}%\n`);
}

module.exports = { callAPI, runBenchmark, median, mean, loadPrompts, makeSystemPrompt, saveResults, updateCompressionJson };

if (require.main === module) {
  main().catch(e => {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Verify script is executable and syntax-valid**

Run: `node -c benchmarks/run.js`
Expected: No output (syntax OK).

- [ ] **Step 3: Test --dry-run produces output files**

Run: `node benchmarks/run.js --dry-run --level full`
Expected:
- `benchmarks/results/` contains a new `.json` file
- `benchmarks/compression.json` exists with `compression.full` key
- Median compression line printed to stdout

- [ ] **Step 4: Commit**

```bash
git add benchmarks/run.js
git commit -m "feat(benchmark): add API benchmark runner with median compression"
```

---

### Task 3: Tests for Benchmark Runner

**Files:**
- Create: `tests/test_benchmark.js`

- [ ] **Step 1: Write tests**

```javascript
#!/usr/bin/env node
// Tests for benchmarks/run.js — mock API mode, no real calls.

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(ROOT, 'benchmarks', 'run.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pordee-bench-test-'));
  try {
    fn(tmp);
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log('benchmark tests\n');

test('median of odd count', () => {
  const { median } = require(RUNNER);
  assert.strictEqual(median([0.1, 0.5, 0.9]), 0.5);
});

test('median of even count', () => {
  const { median } = require(RUNNER);
  assert.strictEqual(median([0.1, 0.4, 0.6, 0.9]), 0.5);
});

test('mean computes average', () => {
  const { mean } = require(RUNNER);
  assert.strictEqual(mean([0.2, 0.4, 0.6]), 0.4);
});

test('loadPrompts reads prompts.json', () => {
  const { loadPrompts } = require(RUNNER);
  const prompts = loadPrompts();
  assert.strictEqual(prompts.length, 8);
  assert.ok(prompts.every(p => p.id && p.prompt));
});

test('makeSystemPrompt returns different text for full vs lite', () => {
  const { makeSystemPrompt } = require(RUNNER);
  const full = makeSystemPrompt('full');
  const lite = makeSystemPrompt('lite');
  assert.notStrictEqual(full, lite);
  assert.match(full, /Fragments OK/);
  assert.doesNotMatch(lite, /Fragments OK/);
});

test('--dry-run generates results and compression.json', (tmp) => {
  const out = execFileSync(process.execPath, [RUNNER, '--dry-run', '--level', 'full'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  assert.match(out, /Benchmark complete/);
  assert.match(out, /Median full compression/);
  // Verify compression.json was written
  const compressionPath = path.join(ROOT, 'benchmarks', 'compression.json');
  assert.ok(fs.existsSync(compressionPath), 'compression.json should exist');
  const data = JSON.parse(fs.readFileSync(compressionPath, 'utf8'));
  assert.ok(typeof data.compression.full === 'number');
});

test('--dry-run with lite level updates compression.json', (tmp) => {
  execFileSync(process.execPath, [RUNNER, '--dry-run', '--level', 'lite'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  const compressionPath = path.join(ROOT, 'benchmarks', 'compression.json');
  const data = JSON.parse(fs.readFileSync(compressionPath, 'utf8'));
  assert.ok(typeof data.compression.lite === 'number');
  assert.ok(typeof data.compression.full === 'number'); // preserved from prior run
});

test('rejects invalid level', () => {
  let err = null;
  try {
    execFileSync(process.execPath, [RUNNER, '--dry-run', '--level', 'invalid'], {
      encoding: 'utf8',
      cwd: ROOT,
    });
  } catch (e) { err = e; }
  assert.ok(err, 'should exit non-zero');
  assert.match(err.stderr, /Invalid level/);
});

test('exits when ANTHROPIC_API_KEY missing and no --dry-run', () => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  let err = null;
  try {
    execFileSync(process.execPath, [RUNNER], {
      encoding: 'utf8',
      cwd: ROOT,
      env,
    });
  } catch (e) { err = e; }
  assert.ok(err, 'should exit non-zero');
  assert.match(err.stderr, /ANTHROPIC_API_KEY not set/);
});

test('runBenchmark produces correct schema', async () => {
  const { runBenchmark } = require(RUNNER);
  const prompts = [
    { id: 'test-a', prompt: 'test prompt one' },
    { id: 'test-b', prompt: 'test prompt two' },
  ];
  const result = await runBenchmark(prompts, 'full', 'claude-test', 'fake-key', true);
  assert.ok(result.timestamp);
  assert.strictEqual(result.model, 'claude-test');
  assert.strictEqual(result.level, 'full');
  assert.strictEqual(result.prompts.length, 2);
  assert.ok(result.prompts[0].normal_tokens > 0);
  assert.ok(result.prompts[0].pordee_tokens > 0);
  assert.ok(result.prompts[0].ratio >= 0 && result.prompts[0].ratio <= 1);
  assert.ok(typeof result.summary.median_ratio === 'number');
  assert.ok(typeof result.summary.mean_ratio === 'number');
  assert.ok(typeof result.summary.min_ratio === 'number');
  assert.ok(typeof result.summary.max_ratio === 'number');
  assert.strictEqual(result.summary.count, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run benchmark tests**

Run: `node tests/test_benchmark.js`
Expected: All tests pass (10 passed, 0 failed).

- [ ] **Step 3: Commit**

```bash
git add tests/test_benchmark.js
git commit -m "test(benchmark): add benchmark runner tests with mocked API"
```

---

### Task 4: pordee-stats.js

**Files:**
- Create: `hooks/pordee-stats.js`

- [ ] **Step 1: Write pordee-stats.js**

```javascript
#!/usr/bin/env node
// pordee-stats — read active Claude Code session log, print token usage + savings.
// Based on caveman-stats.js. Uses median compression from benchmarks/compression.json.
//
// Run directly:    node hooks/pordee-stats.js
// Inside Claude:   /pordee-stats triggers this via UserPromptSubmit hook.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getState } = require('./pordee-config');

// Approximate Anthropic public output-token pricing, USD per million.
const MODEL_OUTPUT_PRICE_PER_M = [
  ['claude-opus-4', 75.00],
  ['claude-sonnet-4', 15.00],
  ['claude-haiku-4', 4.00],
  ['claude-3-5-sonnet', 15.00],
  ['claude-3-5-haiku', 4.00],
  ['claude-3-opus', 75.00],
];

function loadCompression() {
  const compressionPath = path.join(__dirname, '..', 'benchmarks', 'compression.json');
  try {
    const data = JSON.parse(fs.readFileSync(compressionPath, 'utf8'));
    return data.compression || {};
  } catch {
    return {};
  }
}

function priceForModel(model) {
  if (!model) return null;
  for (const [prefix, price] of MODEL_OUTPUT_PRICE_PER_M) {
    if (model.startsWith(prefix)) return price;
  }
  return null;
}

function formatUsd(amount) {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}

function findRecentSession(claudeDir) {
  const projectsDir = path.join(claudeDir, 'projects');
  let entries;
  try { entries = fs.readdirSync(projectsDir, { withFileTypes: true }); }
  catch { return null; }

  let best = null;
  const stack = entries.map(e => path.join(projectsDir, e.name));
  while (stack.length) {
    const p = stack.pop();
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      try {
        for (const child of fs.readdirSync(p)) stack.push(path.join(p, child));
      } catch {}
    } else if (p.endsWith('.jsonl') && (!best || st.mtimeMs > best.mtime)) {
      best = { file: p, mtime: st.mtimeMs };
    }
  }
  return best ? best.file : null;
}

function parseSession(filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); }
  catch { return { outputTokens: 0, cacheReadTokens: 0, turns: 0, model: null }; }

  let outputTokens = 0;
  let cacheReadTokens = 0;
  let turns = 0;
  let model = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== 'assistant' || !entry.message) continue;
    const usage = entry.message.usage;
    if (!usage) continue;
    outputTokens += usage.output_tokens || 0;
    cacheReadTokens += usage.cache_read_input_tokens || 0;
    turns++;
    if (!model && entry.message.model) model = entry.message.model;
  }
  return { outputTokens, cacheReadTokens, turns, model };
}

function deriveSavings({ outputTokens, level, model }) {
  const compression = loadCompression();
  const ratio = compression[level] != null ? compression[level] : null;
  const price = priceForModel(model);
  if (ratio === null) return { estSavedTokens: 0, estSavedUsd: 0 };
  const estNormal = Math.round(outputTokens / (1 - ratio));
  const estSavedTokens = estNormal - outputTokens;
  const estSavedUsd = price !== null ? (estSavedTokens / 1_000_000) * price : 0;
  return { estSavedTokens, estSavedUsd };
}

function parseDuration(spec) {
  if (!spec) return null;
  const m = /^(\d+)([dh])$/.exec(spec.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return m[2] === 'd' ? n * 86_400_000 : n * 3_600_000;
}

function readHistory(historyPath) {
  try {
    return fs.readFileSync(historyPath, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function appendHistory(historyPath, line) {
  try {
    const dir = path.dirname(historyPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(historyPath, line + '\n');
  } catch {
    // Best-effort
  }
}

function aggregateHistory(historyPath, sinceMs) {
  const lines = readHistory(historyPath);
  const cutoff = sinceMs ? Date.now() - sinceMs : null;
  const latestPerSession = new Map();
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || typeof entry !== 'object') continue;
    if (cutoff !== null && (entry.ts || 0) < cutoff) continue;
    const id = entry.session_id || '_';
    const prev = latestPerSession.get(id);
    if (!prev || (entry.ts || 0) >= (prev.ts || 0)) latestPerSession.set(id, entry);
  }
  let outputTokens = 0, estSavedTokens = 0, estSavedUsd = 0;
  for (const e of latestPerSession.values()) {
    outputTokens += e.output_tokens || 0;
    estSavedTokens += e.est_saved_tokens || 0;
    estSavedUsd += e.est_saved_usd || 0;
  }
  return { sessions: latestPerSession.size, outputTokens, estSavedTokens, estSavedUsd };
}

function humanizeTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

function formatHistory({ sessions, outputTokens, estSavedTokens, estSavedUsd, since }) {
  const sep = '──────────────────────────────────';
  const window = since ? ` (last ${since})` : '';
  if (sessions === 0) {
    return `\nพอดี Stats — Lifetime${window}\n${sep}\nNo sessions logged yet — run /pordee-stats inside any session to start tracking.\n${sep}\n`;
  }
  const usdLine = estSavedUsd > 0 ? `Est. saved (USD):      ~${formatUsd(estSavedUsd)}\n` : '';
  return `\nพอดี Stats — Lifetime${window}\n${sep}\n` +
    `Sessions:   ${sessions.toLocaleString()}\n${sep}\n` +
    `Output tokens:         ${outputTokens.toLocaleString()}\n` +
    `Est. tokens saved:     ${estSavedTokens.toLocaleString()}\n` +
    usdLine + sep + '\n';
}

function formatShare({ outputTokens, turns, level, model }) {
  if (turns === 0) {
    return '⚡ pordee armed but no turns yet — pordee';
  }
  const compression = loadCompression();
  const ratio = compression[level] != null ? compression[level] : null;
  const price = priceForModel(model);

  if (ratio !== null) {
    const estSaved = Math.round(outputTokens / (1 - ratio)) - outputTokens;
    let usd = '';
    if (price !== null) {
      const amt = (estSaved / 1_000_000) * price;
      usd = ` (~${formatUsd(amt)})`;
    }
    return `⚡ Saved ${estSaved.toLocaleString()} output tokens${usd} across ${turns} turns this session — pordee`;
  }
  return `⚡ ${turns} turns, ${outputTokens.toLocaleString()} output tokens this session — pordee`;
}

function formatStats({ outputTokens, cacheReadTokens, turns, level, model, sessionPath }) {
  const sep = '──────────────────────────────────';
  const shortPath = sessionPath && sessionPath.length > 45
    ? '...' + sessionPath.slice(-45)
    : (sessionPath || '');

  if (turns === 0) {
    return `\nพอดี Stats\n${sep}\nNo conversation yet — stats available after first response.\n${sep}\n`;
  }

  const compression = loadCompression();
  const ratio = compression[level] != null ? compression[level] : null;
  const price = priceForModel(model);

  let savings;
  let footer = '';
  if (ratio !== null) {
    const estNormal = Math.round(outputTokens / (1 - ratio));
    const estSaved = estNormal - outputTokens;
    let usdLine = '';
    if (price !== null) {
      const usd = (estSaved / 1_000_000) * price;
      usdLine = `Est. saved (USD):      ~${formatUsd(usd)}\n`;
      footer = `Savings est. from benchmarks/ (median per-task). Pricing for ${model}. Actual varies by task.`;
    } else {
      footer = 'Savings est. from benchmarks/ (median per-task). Actual varies by task.';
    }
    savings = `Est. without pordee:   ${estNormal.toLocaleString()}\n` +
              `Est. tokens saved:     ${estSaved.toLocaleString()} (~${Math.round(ratio * 100)}%)\n` +
              usdLine.replace(/\n$/, '');
  } else if (level) {
    savings = `No benchmark data for '${level}' level. Run \`node benchmarks/run.js --level ${level}\` first.`;
  } else {
    savings = 'Pordee not active this session.';
  }

  return `\nพอดี Stats\n${sep}\n` +
    (shortPath ? `Session:  ${shortPath}\n` : '') +
    `Turns:    ${turns}\n${sep}\n` +
    `Output tokens:         ${outputTokens.toLocaleString()}\n` +
    `Cache-read tokens:     ${cacheReadTokens.toLocaleString()}\n${sep}\n` +
    `${savings}\n` +
    (footer ? footer + '\n' : '');
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--session-file');
  const sessionFileArg = i !== -1 ? args[i + 1] : null;
  const share = args.includes('--share');
  const all = args.includes('--all');
  const sinceIdx = args.indexOf('--since');
  const sinceArg = sinceIdx !== -1 ? args[sinceIdx + 1] : null;

  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const pordeeDir = process.env.PORDEE_HOME || path.join(os.homedir(), '.pordee');
  const historyPath = path.join(pordeeDir, 'history.jsonl');

  if (all || sinceArg) {
    const sinceMs = parseDuration(sinceArg);
    if (sinceArg && sinceMs === null) {
      process.stderr.write(`pordee-stats: --since takes Nh or Nd (e.g. 7d, 24h), got: ${sinceArg}\n`);
      process.exit(2);
    }
    const agg = aggregateHistory(historyPath, sinceMs);
    process.stdout.write(formatHistory({ ...agg, since: sinceArg || null }));
    return;
  }

  const sessionFile = sessionFileArg || findRecentSession(claudeDir);

  if (!sessionFile) {
    process.stderr.write('pordee-stats: no Claude Code session found.\n');
    process.exit(1);
  }

  const parsed = parseSession(sessionFile);
  const state = getState();
  const level = state.enabled ? state.level : null;

  if (parsed.turns > 0) {
    const { estSavedTokens, estSavedUsd } = deriveSavings({ ...parsed, level });
    const sessionId = path.basename(sessionFile, '.jsonl');
    appendHistory(historyPath, JSON.stringify({
      ts: Date.now(),
      session_id: sessionId,
      level: level || null,
      model: parsed.model || null,
      output_tokens: parsed.outputTokens,
      est_saved_tokens: estSavedTokens,
      est_saved_usd: estSavedUsd,
    }));

    const agg = aggregateHistory(historyPath, null);
    const suffix = agg.estSavedTokens > 0 ? `⚡ ${humanizeTokens(agg.estSavedTokens)}` : '';
    try {
      fs.mkdirSync(pordeeDir, { recursive: true });
      fs.writeFileSync(path.join(pordeeDir, 'statusline-suffix'), suffix);
    } catch {
      // Best-effort
    }
  }

  if (share) {
    process.stdout.write(formatShare({ ...parsed, level }) + '\n');
  } else {
    process.stdout.write(formatStats({ ...parsed, level, sessionPath: sessionFile }));
  }
}

if (require.main === module) main();

module.exports = {
  formatStats, formatShare, formatHistory, aggregateHistory, parseDuration, deriveSavings,
  parseSession, priceForModel, formatUsd, loadCompression, humanizeTokens,
};
```

- [ ] **Step 2: Verify syntax**

Run: `node -c hooks/pordee-stats.js`
Expected: No output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add hooks/pordee-stats.js
git commit -m "feat(stats): add pordee-stats reporter with dynamic compression lookup"
```

---

### Task 5: Tests for pordee-stats.js

**Files:**
- Create: `tests/test_pordee_stats.js`

- [ ] **Step 1: Write tests**

```javascript
#!/usr/bin/env node
// Tests for pordee-stats — direct script invocation and stats formatting.
// Run: node tests/test_pordee_stats.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STATS = path.join(ROOT, 'hooks', 'pordee-stats.js');
const CONFIG = path.join(ROOT, 'hooks', 'pordee-config.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pordee-stats-test-'));
  try {
    fn(tmp);
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function makeSession(dir, lines) {
  const projDir = path.join(dir, '.claude', 'projects', 'p');
  fs.mkdirSync(projDir, { recursive: true });
  const sessFile = path.join(projDir, 's.jsonl');
  fs.writeFileSync(sessFile, lines.map(l => JSON.stringify(l)).join('\n'));
  return sessFile;
}

function makeCompression(dir, data) {
  const benchDir = path.join(dir, 'benchmarks');
  fs.mkdirSync(benchDir, { recursive: true });
  fs.writeFileSync(path.join(benchDir, 'compression.json'), JSON.stringify(data));
}

console.log('pordee-stats tests\n');

test('reads --session-file directly and sums output tokens', (tmp) => {
  const sess = makeSession(tmp, [
    { type: 'assistant', message: { usage: { output_tokens: 100, cache_read_input_tokens: 200 } } },
    { type: 'user', message: { content: 'hi' } },
    { type: 'assistant', message: { usage: { output_tokens: 50, cache_read_input_tokens: 50 } } },
  ]);
  const out = execFileSync(process.execPath, [STATS, '--session-file', sess], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee') },
  });
  assert.match(out, /Turns:\s+2/);
  assert.match(out, /Output tokens:\s+150/);
  assert.match(out, /Cache-read tokens:\s+250/);
});

test('shows savings estimate when compression.json has data for level', (tmp) => {
  const sess = makeSession(tmp, [
    { type: 'assistant', message: { usage: { output_tokens: 350 } } },
  ]);
  makeCompression(tmp, { compression: { full: 0.58 } });
  // Write pordee state: enabled=true, level=full
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.pordee', 'state.json'), JSON.stringify({ enabled: true, level: 'full', version: 1 }));

  const out = execFileSync(process.execPath, [STATS, '--session-file', sess], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee') },
  });
  // 350 / 0.42 ≈ 833, saved ≈ 483, ~58%
  assert.match(out, /Est\. without pordee:/);
  assert.match(out, /Est\. tokens saved:/);
  assert.match(out, /~58%/);
});

test('shows no-benchmark message when compression.json missing', (tmp) => {
  const sess = makeSession(tmp, [
    { type: 'assistant', message: { usage: { output_tokens: 100 } } },
  ]);
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.pordee', 'state.json'), JSON.stringify({ enabled: true, level: 'full', version: 1 }));

  const out = execFileSync(process.execPath, [STATS, '--session-file', sess], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee') },
  });
  assert.match(out, /No benchmark data for 'full' level/);
});

test('reports no-session when no .jsonl exists', (tmp) => {
  fs.mkdirSync(path.join(tmp, '.claude', 'projects'), { recursive: true });
  let err = null;
  try {
    execFileSync(process.execPath, [STATS], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude') },
    });
  } catch (e) { err = e; }
  assert.ok(err, 'should exit non-zero');
  assert.match(err.stderr, /no Claude Code session found/);
});

test('shows USD savings when model is a known sonnet variant', (tmp) => {
  const sess = makeSession(tmp, [
    { type: 'assistant', message: { model: 'claude-sonnet-4-20250514', usage: { output_tokens: 350 } } },
  ]);
  makeCompression(tmp, { compression: { full: 0.58 } });
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.pordee', 'state.json'), JSON.stringify({ enabled: true, level: 'full', version: 1 }));

  const out = execFileSync(process.execPath, [STATS, '--session-file', sess], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee') },
  });
  assert.match(out, /Est\. saved \(USD\):/);
  assert.match(out, /Pricing for claude-sonnet-4-20250514/);
});

test('omits USD line when model is unknown', (tmp) => {
  const sess = makeSession(tmp, [
    { type: 'assistant', message: { model: 'some-future-model-xyz', usage: { output_tokens: 350 } } },
  ]);
  makeCompression(tmp, { compression: { full: 0.58 } });
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.pordee', 'state.json'), JSON.stringify({ enabled: true, level: 'full', version: 1 }));

  const out = execFileSync(process.execPath, [STATS, '--session-file', sess], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee') },
  });
  assert.match(out, /Est\. tokens saved:/);
  assert.doesNotMatch(out, /Est\. saved \(USD\)/);
});

test('formatStats handles empty session gracefully', () => {
  const { formatStats } = require(STATS);
  const out = formatStats({ outputTokens: 0, cacheReadTokens: 0, turns: 0, level: 'full', model: null });
  assert.match(out, /No conversation yet/);
});

test('--share prints single-line summary', (tmp) => {
  const sess = makeSession(tmp, [
    { type: 'assistant', message: { model: 'claude-sonnet-4-7', usage: { output_tokens: 350 } } },
  ]);
  makeCompression(tmp, { compression: { full: 0.58 } });
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.pordee', 'state.json'), JSON.stringify({ enabled: true, level: 'full', version: 1 }));

  const out = execFileSync(process.execPath, [STATS, '--session-file', sess, '--share'], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee') },
  });
  assert.strictEqual(out.split('\n').filter(Boolean).length, 1);
  assert.match(out, /^⚡ Saved \d+ output tokens/);
});

test('--share works with no benchmark data', (tmp) => {
  const sess = makeSession(tmp, [
    { type: 'assistant', message: { usage: { output_tokens: 200 } } },
  ]);
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.pordee', 'state.json'), JSON.stringify({ enabled: true, level: 'full', version: 1 }));

  const out = execFileSync(process.execPath, [STATS, '--session-file', sess, '--share'], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee') },
  });
  assert.match(out, /^⚡ \d+ turns, \d+ output tokens this session — pordee/);
});

test('appends to lifetime history on each run', (tmp) => {
  const sess = makeSession(tmp, [
    { type: 'assistant', message: { model: 'claude-sonnet-4-7', usage: { output_tokens: 350 } } },
  ]);
  makeCompression(tmp, { compression: { full: 0.58 } });
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.pordee', 'state.json'), JSON.stringify({ enabled: true, level: 'full', version: 1 }));

  execFileSync(process.execPath, [STATS, '--session-file', sess], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee') },
  });
  const histPath = path.join(tmp, '.pordee', 'history.jsonl');
  assert.ok(fs.existsSync(histPath), 'history file should be created');
  const lines = fs.readFileSync(histPath, 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.strictEqual(entry.session_id, 's');
  assert.strictEqual(entry.output_tokens, 350);
  assert.strictEqual(entry.level, 'full');
  assert.strictEqual(entry.model, 'claude-sonnet-4-7');
});

test('--all aggregates latest entry per session', (tmp) => {
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  const histPath = path.join(tmp, '.pordee', 'history.jsonl');
  fs.writeFileSync(histPath, [
    { ts: 1000, session_id: 'a', level: 'full', output_tokens: 100, est_saved_tokens: 185, est_saved_usd: 0.0028 },
    { ts: 2000, session_id: 'b', level: 'full', output_tokens: 50, est_saved_tokens: 92, est_saved_usd: 0.0014 },
    { ts: 3000, session_id: 'b', level: 'full', output_tokens: 200, est_saved_tokens: 371, est_saved_usd: 0.0056 },
  ].map(o => JSON.stringify(o)).join('\n') + '\n');

  const out = execFileSync(process.execPath, [STATS, '--all'], {
    encoding: 'utf8',
    env: { ...process.env, PORDEE_HOME: path.join(tmp, '.pordee') },
  });
  assert.match(out, /Sessions:\s+2/);
  assert.match(out, /Est\. tokens saved:\s+556/);
  assert.match(out, /\$0\.0084/);
});

test('--since filters by time window', (tmp) => {
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  const histPath = path.join(tmp, '.pordee', 'history.jsonl');
  const now = Date.now();
  const twoDaysAgo = now - 2 * 86_400_000;
  const tenMinAgo = now - 10 * 60_000;
  fs.writeFileSync(histPath, [
    { ts: twoDaysAgo, session_id: 'old', level: 'full', output_tokens: 100, est_saved_tokens: 185, est_saved_usd: 0.003 },
    { ts: tenMinAgo, session_id: 'new', level: 'full', output_tokens: 50, est_saved_tokens: 92, est_saved_usd: 0.001 },
  ].map(o => JSON.stringify(o)).join('\n') + '\n');

  const out = execFileSync(process.execPath, [STATS, '--since', '1d'], {
    encoding: 'utf8',
    env: { ...process.env, PORDEE_HOME: path.join(tmp, '.pordee') },
  });
  assert.match(out, /Sessions:\s+1/);
  assert.match(out, /Est\. tokens saved:\s+92/);
  assert.match(out, /\(last 1d\)/);
});

test('--since rejects malformed durations', (tmp) => {
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  let err = null;
  try {
    execFileSync(process.execPath, [STATS, '--since', 'sometime'], {
      encoding: 'utf8',
      env: { ...process.env, PORDEE_HOME: path.join(tmp, '.pordee') },
    });
  } catch (e) { err = e; }
  assert.ok(err, 'should exit non-zero');
  assert.match(err.stderr, /--since takes Nh or Nd/);
});

test('--all reports empty when no history', (tmp) => {
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  const out = execFileSync(process.execPath, [STATS, '--all'], {
    encoding: 'utf8',
    env: { ...process.env, PORDEE_HOME: path.join(tmp, '.pordee') },
  });
  assert.match(out, /No sessions logged yet/);
});

test('writes statusline suffix file after a stats run', (tmp) => {
  const sess = makeSession(tmp, [
    { type: 'assistant', message: { model: 'claude-sonnet-4-7', usage: { output_tokens: 1500 } } },
  ]);
  makeCompression(tmp, { compression: { full: 0.58 } });
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.pordee', 'state.json'), JSON.stringify({ enabled: true, level: 'full', version: 1 }));

  execFileSync(process.execPath, [STATS, '--session-file', sess], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee') },
  });
  const suffixPath = path.join(tmp, '.pordee', 'statusline-suffix');
  assert.ok(fs.existsSync(suffixPath));
  const suffix = fs.readFileSync(suffixPath, 'utf8');
  assert.match(suffix, /^⚡/);
});

test('humanizeTokens formats small/medium/large correctly', () => {
  const { humanizeTokens } = require(STATS);
  assert.strictEqual(humanizeTokens(0), '0');
  assert.strictEqual(humanizeTokens(42), '42');
  assert.strictEqual(humanizeTokens(2786), '2.8k');
  assert.strictEqual(humanizeTokens(1_250_000), '1.3M');
});

test('priceForModel matches by prefix across point releases', () => {
  const { priceForModel } = require(STATS);
  assert.strictEqual(priceForModel('claude-opus-4-7'), 75.00);
  assert.strictEqual(priceForModel('claude-opus-4-20250101'), 75.00);
  assert.strictEqual(priceForModel('claude-sonnet-4-7-20260315'), 15.00);
  assert.strictEqual(priceForModel('claude-haiku-4-5'), 4.00);
  assert.strictEqual(priceForModel('claude-3-5-sonnet-20241022'), 15.00);
  assert.strictEqual(priceForModel(null), null);
  assert.strictEqual(priceForModel('gpt-4'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run pordee-stats tests**

Run: `node tests/test_pordee_stats.js`
Expected: All tests pass (20 passed, 0 failed).

- [ ] **Step 3: Commit**

```bash
git add tests/test_pordee_stats.js
git commit -m "test(stats): add pordee-stats tests for parsing, savings, aggregation"
```

---

### Task 6: Extend Mode Tracker with /pordee-stats Trigger

**Files:**
- Modify: `hooks/pordee-mode-tracker.js`

- [ ] **Step 1: Add /pordee-stats detection and handling**

In `hooks/pordee-mode-tracker.js`, modify `parseTrigger` to detect `/pordee-stats` before other slash commands, and add a handler that runs pordee-stats.js as a child process.

Add after the `stripCodeFences` function (before `parseTrigger`):

```javascript
const { execFileSync } = require('child_process');
```

Modify `parseTrigger` to check for stats trigger first:

Replace the existing `parseTrigger` function with:

```javascript
function parseTrigger(prompt) {
  const cleaned = stripCodeFences(prompt);
  const trimmed = cleaned.trim();

  // Stats trigger — handled specially by the caller.
  if (/^\/pordee-stats(?:\s+--share)?$/.test(trimmed)) {
    return { action: 'stats', share: trimmed.includes('--share') };
  }

  // Slash commands — case-insensitive on the command, exact on args.
  const slashMatch = trimmed.match(/^\/pordee(?:\s+(\w+))?$/i);
  if (slashMatch) {
    const arg = (slashMatch[1] || '').toLowerCase();
    if (arg === 'lite') return { enabled: true, level: 'lite' };
    if (arg === 'full') return { enabled: true, level: 'full' };
    if (arg === 'stop') return { enabled: false };
    if (arg === '') return { enabled: true };
    return null;
  }

  // Thai phrase triggers
  const enableThai = ['พอดีโหมด', 'พูดสั้นๆ', 'พอดี'];
  const disableThai = ['หยุดพอดี', 'พูดปกติ'];

  for (const phrase of disableThai) {
    if (trimmed === phrase) return { enabled: false };
  }
  for (const phrase of enableThai) {
    if (trimmed === phrase) return { enabled: true };
  }

  return null;
}
```

Then modify the stdin handler to handle the stats action:

Replace the entire `process.stdin.on('end', ...)` block with:

```javascript
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').toString();
    const transcriptPath = data.transcript_path || null;

    const trigger = parseTrigger(prompt);
    if (!trigger) {
      // No trigger — just emit reminder if active
      const state = getState();
      if (state.enabled) emitActiveReminder(state);
      process.exit(0);
      return;
    }

    if (trigger.action === 'stats') {
      // Run pordee-stats.js and return its output as a blocked response
      const statsScript = path.join(__dirname, 'pordee-stats.js');
      const args = ['--session-file', transcriptPath || ''];
      if (trigger.share) args.push('--share');
      const statsOut = execFileSync(process.execPath, [statsScript, ...args], {
        encoding: 'utf8',
        env: process.env,
        timeout: 5000,
      });
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: statsOut.trim(),
      }));
      process.exit(0);
      return;
    }

    // Mode trigger — update state
    setState(trigger);

    const state = getState();
    if (state.enabled) {
      emitActiveReminder(state);
    }
  } catch (e) {
    logError(`mode-tracker: ${e.message}`);
  }
  process.exit(0);
});
```

Also add `const path = require('path');` at the top of the file if not already present.

- [ ] **Step 2: Verify syntax**

Run: `node -c hooks/pordee-mode-tracker.js`
Expected: No output (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add hooks/pordee-mode-tracker.js
git commit -m "feat(tracker): add /pordee-stats trigger with stats output blocking"
```

---

### Task 7: Full Test Suite Run

- [ ] **Step 1: Run all tests**

Run: `node --test tests/test_*.js`

Expected: All test files pass with no failures.

Alternative if `node --test` glob doesn't work on Windows:
```bash
node tests/test_benchmark.js && node tests/test_pordee_stats.js && node tests/test_state.js && node tests/test_triggers.js && node tests/test_tracker.js && node tests/test_activate.js
```

- [ ] **Step 2: Commit if all pass**

```bash
git commit -m "test: verify full suite passes with pordee-stats + benchmark"
```

---

## Plan Self-Review

**1. Spec coverage:**
- ✅ Benchmark runner with live API calls → Task 2
- ✅ 8 dedicated Thai dev prompts → Task 1
- ✅ Median compression per level → Task 2 (median function + summary)
- ✅ `benchmarks/results/` + `compression.json` → Task 2
- ✅ pordee-stats reads compression.json at runtime → Task 4
- ✅ Fallback when compression.json missing → Task 4 + tests
- ✅ `--share`, `--all`, `--since` → Task 4
- ✅ Thai branding (พอดี Stats, ⚡) → Task 4
- ✅ `/pordee-stats` trigger via mode tracker → Task 6
- ✅ Tests for benchmark + stats → Tasks 3, 5

**2. Placeholder scan:**
- ✅ No TBD/TODO. All code blocks contain complete implementation.
- ✅ No vague "add error handling" steps.

**3. Type consistency:**
- ✅ `compression.json` schema matches between benchmark writer (Task 2) and stats reader (Task 4)
- ✅ `loadCompression()` returns `{}` on error, consistent with `compression[level] != null` checks
- ✅ History file format matches between append (Task 4) and read/aggregate (Task 4)

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-pordee-stats.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**
