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
  fs.mkdirSync(path.join(tmp, '.pordee'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.pordee', 'state.json'), JSON.stringify({ enabled: true, level: 'full', version: 1 }));

  const out = execFileSync(process.execPath, [STATS, '--session-file', sess], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee'), PORDEE_BENCHMARK_DIR: path.join(tmp, 'benchmarks') },
  });
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
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee'), PORDEE_BENCHMARK_DIR: path.join(tmp, 'benchmarks') },
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
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee'), PORDEE_BENCHMARK_DIR: path.join(tmp, 'benchmarks') },
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
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee'), PORDEE_BENCHMARK_DIR: path.join(tmp, 'benchmarks') },
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
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee'), PORDEE_BENCHMARK_DIR: path.join(tmp, 'benchmarks') },
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
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee'), PORDEE_BENCHMARK_DIR: path.join(tmp, 'no-benchmarks') },
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
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee'), PORDEE_BENCHMARK_DIR: path.join(tmp, 'benchmarks') },
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
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), PORDEE_HOME: path.join(tmp, '.pordee'), PORDEE_BENCHMARK_DIR: path.join(tmp, 'benchmarks') },
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
