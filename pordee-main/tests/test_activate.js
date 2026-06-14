const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ACTIVATE_PATH = path.join(__dirname, '..', 'hooks', 'pordee-activate.js');

function runActivate(env = {}) {
  return spawnSync(process.execPath, [ACTIVATE_PATH], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 5000
  });
}

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pordee-test-'));
}

test('activate exits 0 when state file missing (silent)', () => {
  const home = makeTempHome();
  try {
    const result = runActivate({ PORDEE_HOME: home });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '', 'should emit nothing when state missing/disabled');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('activate exits 0 silently when enabled=false', () => {
  const home = makeTempHome();
  try {
    fs.writeFileSync(path.join(home, 'state.json'),
      JSON.stringify({ enabled: false, level: 'full', version: 1 }));
    const result = runActivate({ PORDEE_HOME: home });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('activate emits reminder when enabled=true level=full', () => {
  const home = makeTempHome();
  try {
    fs.writeFileSync(path.join(home, 'state.json'),
      JSON.stringify({ enabled: true, level: 'full', version: 1 }));
    const result = runActivate({ PORDEE_HOME: home });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /PORDEE MODE ACTIVE/);
    assert.match(result.stdout, /level: full/);
    assert.match(result.stdout, /Thai/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('activate emits reminder when enabled=true level=lite', () => {
  const home = makeTempHome();
  try {
    fs.writeFileSync(path.join(home, 'state.json'),
      JSON.stringify({ enabled: true, level: 'lite', version: 1 }));
    const result = runActivate({ PORDEE_HOME: home });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /level: lite/);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('activate exits 0 even on internal error (never blocks)', () => {
  const home = makeTempHome();
  try {
    // Create a directory at state.json path → reading it as file will throw.
    fs.mkdirSync(path.join(home, 'state.json'));
    const result = runActivate({ PORDEE_HOME: home });
    assert.equal(result.status, 0, 'must exit 0 even when state read throws');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
