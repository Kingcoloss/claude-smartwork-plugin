/**
 * Sprint 2 (Perception) deterministic test — unlike smoke.ts this is a GATE:
 * it asserts logic and exits non-zero on any failure. The ollama call is stubbed
 * (mock chatFn for units; a fake HTTP server for the end-to-end hook run) so the
 * result is deterministic and needs no model pulled.
 *
 * Run:  bun run cortex/scripts/perception-test.ts
 */
import { classify } from '../lib/router.ts';
import { compress, preservesCritical, criticalTokens } from '../lib/compress.ts';
import { cacheOriginal } from '../lib/cache.ts';
import { getConfig } from '../lib/config.ts';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

const cfg = getConfig({ fresh: true });

// ── 1. Router classification ────────────────────────────────────────────────
ok(classify('{"a":1,"b":[1,2,3]}') === 'json', 'classify json object');
ok(classify('[1,2,3,4]') === 'json', 'classify json array');
ok(
  classify('export function f(x) {\n  const y = x + 1;\n  return y;\n}') === 'code',
  'classify code',
);
ok(
  classify('/etc/hosts:1:127.0.0.1 localhost\n/etc/hosts:2:255.255.255.255') === 'code',
  'classify grep-style content as code',
);
ok(
  classify('The build finished and all checks passed without any warnings today.') === 'prose',
  'classify prose',
);
ok(classify('   ') === 'prose', 'classify blank → prose');

// ── 2. Guardrail (critical-token preservation) ──────────────────────────────
const orig = 'Error at /var/log/app.log line 4012, trace id a1b2c3d4e5f6 see https://x.io/y';
ok(criticalTokens(orig).includes('/var/log/app.log'), 'criticalTokens captures abs path');
ok(criticalTokens(orig).includes('https://x.io/y'), 'criticalTokens captures URL');
ok(criticalTokens(orig).includes('4012'), 'criticalTokens captures multi-digit number');
ok(criticalTokens(orig).includes('a1b2c3d4e5f6'), 'criticalTokens captures hash');
ok(
  preservesCritical(orig, 'fail at /var/log/app.log:4012 id a1b2c3d4e5f6 https://x.io/y') === true,
  'guardrail passes when all critical tokens kept',
);
ok(
  preservesCritical(orig, 'an error happened in the log, see the trace') === false,
  'guardrail rejects when critical tokens dropped',
);

// ── 3. compress() with mock chatFn ──────────────────────────────────────────
ok(cfg.perception.timeoutMs === 15000, 'config exposes a tunable sync timeout (default 15000ms)');
const sample = 'Listening on /tmp/sock at port 8080; pid 31337; status OK';
const goodChat = async () => 'srv /tmp/sock port 8080 pid 31337 OK';
const dropsChat = async () => 'server is up and running fine';
const emptyChat = async () => '';
const nullChat = async () => null;
ok((await compress(sample, 'prose', cfg, { chatFn: goodChat })) === 'srv /tmp/sock port 8080 pid 31337 OK', 'compress returns guardrail-passing summary');
ok((await compress(sample, 'prose', cfg, { chatFn: dropsChat })) === null, 'compress rejects token-dropping summary');
ok((await compress(sample, 'prose', cfg, { chatFn: emptyChat })) === null, 'compress no-ops on empty reply');
ok((await compress(sample, 'prose', cfg, { chatFn: nullChat })) === null, 'compress no-ops on null (ollama down)');

// ── 4. cacheOriginal() round-trip ───────────────────────────────────────────
const baseDir = mkdtempSync(join(tmpdir(), 'cortex-cache-'));
const text = 'verbatim original ' + 'x'.repeat(100);
const c1 = cacheOriginal(text, baseDir);
ok(c1 !== null, 'cacheOriginal returns a record');
ok(!!c1 && existsSync(join(baseDir, c1.path)), 'cache file exists at returned path');
ok(!!c1 && readFileSync(join(baseDir, c1.path), 'utf8') === text, 'cache file content === original');
ok(!!c1 && c1.path.startsWith('.cortex-cache/') && c1.path.endsWith('.txt'), 'cache path is project-relative .cortex-cache/<id>.txt');
const c2 = cacheOriginal(text, baseDir);
ok(!!c1 && !!c2 && c1.id === c2.id, 'same text → same id (idempotent)');

// ── 5. End-to-end hook run against a fake ollama server ─────────────────────
const SUMMARY = 'compressed: see /etc/hosts and 42000';
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    if (new URL(req.url).pathname === '/api/chat') {
      return Response.json({ message: { content: SUMMARY } });
    }
    return new Response('not found', { status: 404 });
  },
});
const host = `http://localhost:${server.port}`;
const hookPath = join(import.meta.dir, '..', 'hooks', 'perception-posttooluse.ts');

async function runHook(payload: unknown, runDir: string): Promise<string> {
  const proc = Bun.spawn(['bun', hookPath], {
    cwd: runDir,
    env: { ...process.env, OLLAMA_HOST: host, CORTEX_COMPRESS_MODEL: 'fake' },
    stdin: new TextEncoder().encode(JSON.stringify(payload)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

// Big Bash output, padded past the 4000-char threshold, with a known critical-token set.
const bigStdout =
  'the quick brown fox jumps over the lazy dog. '.repeat(120) + ' path /etc/hosts value 42000';
const runDir = mkdtempSync(join(tmpdir(), 'cortex-run-'));
const out = await runHook(
  { tool_name: 'Bash', tool_response: { stdout: bigStdout, stderr: '', interrupted: false, isImage: false, noOutputExpected: false } },
  runDir,
);

let parsed: any = null;
try { parsed = JSON.parse(out); } catch {}
ok(parsed !== null, 'hook emits valid JSON on successful replace', out.slice(0, 80));
ok(parsed?.hookSpecificOutput?.hookEventName === 'PostToolUse', 'emits correct hookEventName');
const newStdout = parsed?.hookSpecificOutput?.updatedToolOutput?.stdout;
ok(typeof newStdout === 'string' && newStdout.startsWith('⟦cortex:'), 'replacement stdout carries cortex marker');
ok(typeof newStdout === 'string' && newStdout.includes(SUMMARY), 'replacement contains the compressed summary');
ok(typeof newStdout === 'string' && /cat \.cortex-cache\/[0-9a-f]+\.txt/.test(newStdout), 'replacement carries a cat-able original pointer');
ok(parsed?.hookSpecificOutput?.updatedToolOutput?.noOutputExpected === false, 'replacement preserves other Bash keys');
// the pointed-at cache file holds the verbatim original
const m = typeof newStdout === 'string' ? newStdout.match(/cat (\.cortex-cache\/[0-9a-f]+\.txt)/) : null;
ok(!!m && readFileSync(join(runDir, m[1]), 'utf8') === bigStdout, 'cached file holds the verbatim original');

// Negative: under-threshold output → no replacement (empty stdout)
const small = await runHook(
  { tool_name: 'Bash', tool_response: { stdout: 'tiny', stderr: '', interrupted: false, isImage: false, noOutputExpected: false } },
  runDir,
);
ok(small.trim() === '', 'under-threshold output → no replacement (empty stdout)');

server.stop();

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
