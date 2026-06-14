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
  assert.ok(Math.abs(mean([0.2, 0.4, 0.6]) - 0.4) < 1e-10);
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
