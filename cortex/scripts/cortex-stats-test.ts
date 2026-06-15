/**
 * cortex-stats + status-readout deterministic GATE (Sprint 3 / S3-T6).
 * Asserts the savings accumulator (lib/stats.ts) and the on-demand status script
 * end-to-end, exiting non-zero on any failure. Isolation is total: an isolated
 * CLAUDE_CONFIG_DIR for the store and an empty cwd for the subprocess so no real
 * config/project settings leak in. No network, no Claude Code.
 *
 * Run:  bun run cortex/scripts/cortex-stats-test.ts
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// ── 1. stats store round-trip (isolated CLAUDE_CONFIG_DIR) ───────────────────
const cfgDir = mkdtempSync(join(tmpdir(), 'cortex-stats-'));
process.env.CLAUDE_CONFIG_DIR = cfgDir;
// Import AFTER setting the env so configDir() resolves to our temp dir.
const { readStats, recordCompression } = await import('../lib/stats.ts');

const empty = readStats();
ok(empty.compressions === 0 && empty.savedChars === 0, 'empty store reads all zeroes');

ok(recordCompression(1000, 600) === true, 'recordCompression returns true on a real gain');
let s = readStats();
ok(s.compressions === 1 && s.originalChars === 1000 && s.compressedChars === 600 && s.savedChars === 400,
  'first record accumulates correctly', JSON.stringify(s));

ok(recordCompression(500, 500) === false, 'no-gain record is rejected');
s = readStats();
ok(s.compressions === 1 && s.savedChars === 400, 'rejected record leaves totals unchanged');

ok(recordCompression(2000, 1500) === true, 'second real gain records');
s = readStats();
ok(s.compressions === 2 && s.originalChars === 3000 && s.compressedChars === 2100 && s.savedChars === 900,
  'totals accumulate across records', JSON.stringify(s));

// Clobbered store → zeroes (never throws into the hook/skill)
writeFileSync(join(cfgDir, '.cortex-stats.json'), 'not json {{{', 'utf8');
const clobbered = readStats();
ok(clobbered.compressions === 0 && clobbered.savedChars === 0, 'clobbered store reads back as zeroes');

// ── 2. status script end-to-end ──────────────────────────────────────────────
const cfgDir2 = mkdtempSync(join(tmpdir(), 'cortex-status-'));
writeFileSync(join(cfgDir2, '.cortex-expression'), 'lite', { mode: 0o600 }); // runtime override
writeFileSync(
  join(cfgDir2, '.cortex-stats.json'),
  JSON.stringify({ compressions: 3, originalChars: 8000, compressedChars: 5000, savedChars: 3000 }),
  { mode: 0o600 },
);
const emptyCwd = mkdtempSync(join(tmpdir(), 'cortex-cwd-'));
const scriptPath = join(import.meta.dir, 'cortex-status.ts');

const proc = Bun.spawn(['bun', scriptPath], {
  cwd: emptyCwd, // no project cortex.local.md to leak in
  env: { ...process.env, CLAUDE_CONFIG_DIR: cfgDir2 },
  stdout: 'pipe',
  stderr: 'pipe',
});
const out = await new Response(proc.stdout).text();
await proc.exited;

ok(out.includes('cortex status'), 'status prints a header');
ok(/expression:\s+on \(lite\)/.test(out), 'status reflects the runtime override (lite)', out.trim());
ok(out.includes('runtime override (/cortex lite)'), 'status names the override source');
ok(out.includes('3000 chars') && out.includes('over 3 compression'), 'status reports cumulative savings');
ok(out.includes('threshold 4000c'), 'status reports the perception threshold');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
