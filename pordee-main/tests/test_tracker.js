const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TRACKER_PATH = path.join(__dirname, '..', 'hooks', 'pordee-mode-tracker.js');

function runTracker(prompt, env = {}) {
  return spawnSync(process.execPath, [TRACKER_PATH], {
    env: { ...process.env, ...env },
    input: JSON.stringify({ prompt }),
    encoding: 'utf8',
    timeout: 5000
  });
}

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pordee-test-'));
}

function readState(home) {
  const p = path.join(home, 'state.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('tracker exits 0 with empty stdout when state disabled and no trigger', () => {
  const home = makeTempHome();
  try {
    const result = runTracker('hello world', { PORDEE_HOME: home });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('tracker emits hookSpecificOutput JSON when pordee enabled', () => {
  const home = makeTempHome();
  try {
    fs.writeFileSync(path.join(home, 'state.json'),
      JSON.stringify({ enabled: true, level: 'full', version: 1 }));
    const result = runTracker('regular prompt', { PORDEE_HOME: home });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(parsed.hookSpecificOutput.additionalContext, /PORDEE MODE ACTIVE/);
    assert.match(parsed.hookSpecificOutput.additionalContext, /full/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('tracker exits 0 on malformed stdin JSON (silent)', () => {
  const home = makeTempHome();
  try {
    const result = spawnSync(process.execPath, [TRACKER_PATH], {
      env: { ...process.env, PORDEE_HOME: home },
      input: '{not valid json',
      encoding: 'utf8',
      timeout: 5000
    });
    assert.equal(result.status, 0);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('tracker ignores trigger inside code fence', () => {
  const home = makeTempHome();
  try {
    const promptWithFence = 'see this:\n```\n/pordee lite\n```\nthat was inside a fence';
    const result = runTracker(promptWithFence, { PORDEE_HOME: home });
    assert.equal(result.status, 0);
    const state = readState(home);
    assert.ok(state === null || state.enabled === false,
      'state should NOT be enabled when trigger is inside code fence');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('tracker activates with /pordee', () => {
  const home = makeTempHome();
  try {
    runTracker('/pordee', { PORDEE_HOME: home });
    const state = readState(home);
    assert.ok(state, 'state file should be written');
    assert.equal(state.enabled, true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('tracker switches level with /pordee lite', () => {
  const home = makeTempHome();
  try {
    runTracker('/pordee lite', { PORDEE_HOME: home });
    const state = readState(home);
    assert.equal(state.enabled, true);
    assert.equal(state.level, 'lite');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('tracker disables with /pordee stop', () => {
  const home = makeTempHome();
  try {
    fs.writeFileSync(path.join(home, 'state.json'),
      JSON.stringify({ enabled: true, level: 'full', version: 1 }));
    runTracker('/pordee stop', { PORDEE_HOME: home });
    const state = readState(home);
    assert.equal(state.enabled, false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
