/**
 * Cognition lifecycle-wiring deterministic GATE (Sprint 5 / S5-T4).
 * Spawns the two new hooks end-to-end (NO ollama / NO Claude):
 *  - cognition-sessionstart.ts → emits the standing prime (disciplines + นิวรณ์5); honours the off-switch.
 *  - cognition-userpromptsubmit.ts → injects the metacognition red-flag ONLY when the prompt recalls a
 *    chronic Core Memory lesson (seeded here, FTS keyword recall); no-ops otherwise.
 *
 * Run:  bun run cortex/scripts/cognition-wire-test.ts
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// Isolate config BEFORE importing (getConfig caches; spawned children inherit this env).
process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cortex-wire-cfg-'));
const { cognitionPrimer } = await import('../lib/cognition.ts');
const { openMemory, closeMemory, commitCore } = await import('../lib/memory.ts');

const ssPath = join(import.meta.dir, '..', 'hooks', 'cognition-sessionstart.ts');
const upsPath = join(import.meta.dir, '..', 'hooks', 'cognition-userpromptsubmit.ts');

async function runHook(path: string, stdin: unknown, env: Record<string, string> = {}, cwd?: string): Promise<string> {
  const proc = Bun.spawn(['bun', path], {
    cwd,
    env: { ...process.env, ...env },
    stdin: new TextEncoder().encode(typeof stdin === 'string' ? stdin : JSON.stringify(stdin)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

// ── 1. cognitionPrimer — both standing blocks, in order ──────────────────────
const primer = cognitionPrimer();
ok(primer.includes('⟦cortex cognition') && primer.includes('⟦cortex metacognition'), 'primer carries both the discipline and the metacognition blocks');
ok(primer.indexOf('⟦cortex cognition') < primer.indexOf('⟦cortex metacognition'), 'disciplines (prime) precede hindrances (watch-list)');
ok(primer.includes('Yoniso') && primer.includes('Uddhacca'), 'primer renders disciplines + hindrances');

// ── 2. SessionStart hook — emits the prime, honours the off-switch ───────────
const ss = await runHook(ssPath, '{}');
ok(ss.includes('⟦cortex cognition') && ss.includes('⟦cortex metacognition'), 'SessionStart hook injects the standing prime');
const ssOff = await runHook(ssPath, '{}', { CORTEX_COGNITION: '0' });
ok(ssOff.trim() === '', 'CORTEX_COGNITION=0 → SessionStart emits nothing (off-switch)');

// ── 3. UserPromptSubmit hook — the metacognition red-flag, end-to-end ────────
const dir = mkdtempSync(join(tmpdir(), 'cortex-wire-mem-'));
const seed = openMemory({ dir, enableVec: false, embed: async () => null })!;
for (let i = 0; i < 3; i++) await commitCore(seed, { dukkha: 'deadlock on the shared connection lock', magga: 'acquire locks in a fixed global order' });
closeMemory(seed);

const memEnv = { CORTEX_MEMORY_DIR: dir };
const hit = await runHook(upsPath, { prompt: 'why does the deadlock on the shared connection lock keep happening' }, memEnv, dir);
const parsed = (() => { try { return JSON.parse(hit); } catch { return null; } })();
ok(parsed?.hookSpecificOutput?.hookEventName === 'UserPromptSubmit', 'chronic prompt → hook emits UserPromptSubmit output');
const ctx: string = parsed?.hookSpecificOutput?.additionalContext ?? '';
ok(/อุทธัจจกุกกุจจะ/.test(ctx) && /seen ×3/.test(ctx), 'injected context carries the thrashing red-flag (seen ×3)');
ok(ctx.includes('deadlock on the shared connection lock'), 'injected context names the recurring problem');

const miss = await runHook(upsPath, { prompt: 'xyzzy plugh quux brand new unrelated task' }, memEnv, dir);
ok(miss.trim() === '', 'non-recurring prompt → no-op (no flag emitted)');
const empty = await runHook(upsPath, { prompt: '   ' }, memEnv, dir);
ok(empty.trim() === '', 'empty prompt → no-op');
const control = await runHook(upsPath, { prompt: '/cortex status' }, memEnv, dir);
ok(control.trim() === '', '/cortex control prompt → no-op');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
