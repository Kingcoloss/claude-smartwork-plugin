const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Each test gets a unique temp PORDEE_HOME to avoid polluting the real one.
function makeTempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pordee-test-'));
  process.env.PORDEE_HOME = dir;
  // Bust require cache so the helper picks up the new env var.
  delete require.cache[require.resolve('../hooks/pordee-config.js')];
  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.PORDEE_HOME;
}

test('getState returns defaults when state file missing', () => {
  const home = makeTempHome();
  try {
    const { getState, DEFAULT_STATE } = require('../hooks/pordee-config.js');
    const state = getState();
    assert.equal(state.enabled, DEFAULT_STATE.enabled);
    assert.equal(state.level, DEFAULT_STATE.level);
    assert.equal(state.version, DEFAULT_STATE.version);
  } finally {
    cleanup(home);
  }
});

test('getState returns defaults when JSON malformed', () => {
  const home = makeTempHome();
  try {
    const { getState, STATE_PATH, DEFAULT_STATE } = require('../hooks/pordee-config.js');
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, '{not valid json');
    const state = getState();
    assert.equal(state.enabled, DEFAULT_STATE.enabled);
    assert.equal(state.level, DEFAULT_STATE.level);
  } finally {
    cleanup(home);
  }
});

test('setState creates pordee dir if missing', () => {
  const home = makeTempHome();
  try {
    const { setState, STATE_PATH } = require('../hooks/pordee-config.js');
    setState({ enabled: true, level: 'lite' });
    assert.ok(fs.existsSync(STATE_PATH), 'state file should exist');
    const written = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    assert.equal(written.enabled, true);
    assert.equal(written.level, 'lite');
    assert.equal(written.version, 1);
    assert.ok(written.lastChanged, 'lastChanged timestamp should be set');
  } finally {
    cleanup(home);
  }
});

test('setState writes atomically (no .tmp file remains)', () => {
  const home = makeTempHome();
  try {
    const { setState, STATE_PATH } = require('../hooks/pordee-config.js');
    setState({ enabled: true, level: 'full' });
    const tmpPath = STATE_PATH + '.tmp';
    assert.ok(!fs.existsSync(tmpPath), '.tmp file should not exist after write');
  } finally {
    cleanup(home);
  }
});

test('setState merges with existing state (partial update)', () => {
  const home = makeTempHome();
  try {
    const { getState, setState } = require('../hooks/pordee-config.js');
    setState({ enabled: true, level: 'full' });
    setState({ level: 'lite' });
    const state = getState();
    assert.equal(state.enabled, true, 'enabled should be preserved');
    assert.equal(state.level, 'lite', 'level should be updated');
  } finally {
    cleanup(home);
  }
});

test('STATE_PATH respects PORDEE_HOME env var', () => {
  const home = makeTempHome();
  try {
    const { STATE_PATH } = require('../hooks/pordee-config.js');
    assert.ok(STATE_PATH.startsWith(home), `STATE_PATH (${STATE_PATH}) should start with ${home}`);
  } finally {
    cleanup(home);
  }
});

test('STATE_PATH defaults to ~/.pordee/state.json when PORDEE_HOME unset', () => {
  // Don't use makeTempHome — we want PORDEE_HOME UNSET for this test
  delete process.env.PORDEE_HOME;
  delete require.cache[require.resolve('../hooks/pordee-config.js')];
  const { STATE_PATH } = require('../hooks/pordee-config.js');
  const expected = path.join(os.homedir(), '.pordee', 'state.json');
  assert.equal(STATE_PATH, expected);
});
