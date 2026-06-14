const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TRACKER_PATH = path.join(__dirname, '..', 'hooks', 'pordee-mode-tracker.js');

function runTracker(prompt, home) {
  return spawnSync(process.execPath, [TRACKER_PATH], {
    env: { ...process.env, PORDEE_HOME: home },
    input: JSON.stringify({ prompt }),
    encoding: 'utf8',
    timeout: 5000
  });
}

function readState(home) {
  const p = path.join(home, 'state.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const cases = [
  { input: '/pordee',          enabled: true,  level: 'full' },
  { input: '/pordee lite',     enabled: true,  level: 'lite' },
  { input: '/pordee full',     enabled: true,  level: 'full' },
  { input: '/pordee stop',     enabled: false, level: 'full' },
  { input: 'พอดี',              enabled: true,  level: 'full' },
  { input: 'พอดีโหมด',          enabled: true,  level: 'full' },
  { input: 'พูดสั้นๆ',           enabled: true,  level: 'full' },
  { input: 'หยุดพอดี',          enabled: false, level: 'full' },
  { input: 'พูดปกติ',           enabled: false, level: 'full' }
];

for (const tc of cases) {
  test(`trigger: "${tc.input}" → enabled=${tc.enabled} level=${tc.level}`, () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pordee-trig-'));
    try {
      // Seed with enabled state for stop-cases so the transition is visible.
      if (!tc.enabled) {
        fs.writeFileSync(path.join(home, 'state.json'),
          JSON.stringify({ enabled: true, level: 'full', version: 1 }));
      }
      runTracker(tc.input, home);
      const state = readState(home);
      assert.ok(state, `state should be written for "${tc.input}"`);
      assert.equal(state.enabled, tc.enabled, `enabled mismatch for "${tc.input}"`);
      assert.equal(state.level, tc.level, `level mismatch for "${tc.input}"`);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
}

test('trigger NOT detected when input is unrelated', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pordee-trig-'));
  try {
    runTracker('how do I write a python script', home);
    const state = readState(home);
    assert.ok(state === null || state.enabled === false,
      'no trigger should leave state at defaults');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('trigger NOT detected when "พอดี" is part of larger Thai sentence', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pordee-trig-'));
  try {
    // Should not match because input is not exactly "พอดี" — it has more text.
    runTracker('ไม่พอดีกับขนาดของกล่อง', home);
    const state = readState(home);
    assert.ok(state === null || state.enabled === false,
      'substring match should not fire');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
