/**
 * cortex-think deep-reasoning CLI deterministic GATE (Sprint 5 / S5-T5).
 * Spawns the real CLI (NO ollama / NO Claude): the discipline scaffold must stand alone with
 * no memory, and enrich with the metacognition flag + recalled lessons when the store has a
 * chronic, matching lesson (seeded here, FTS keyword recall).
 *
 * Run:  bun run cortex/scripts/cortex-think-test.ts
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// Isolate config BEFORE importing memory (spawned children inherit this env).
process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cortex-think-cfg-'));
const { openMemory, closeMemory, commitCore } = await import('../lib/memory.ts');
const cliPath = join(import.meta.dir, 'cortex-think.ts');

async function run(args: string[], env: Record<string, string> = {}, cwd?: string): Promise<string> {
  const proc = Bun.spawn(['bun', cliPath, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

// ── 1. no query → usage guidance ─────────────────────────────────────────────
const none = await run([]);
ok(/pass a problem/i.test(none), 'no argument → prints usage guidance');

// ── 2. scaffold stands alone — empty memory → just the discipline prime ──────
const emptyDir = mkdtempSync(join(tmpdir(), 'cortex-think-empty-'));
const scaffold = await run(['some brand new problem nobody has seen'], { CORTEX_MEMORY_DIR: emptyDir }, emptyDir);
ok(scaffold.includes('⟦cortex cognition') && scaffold.includes('⟦cortex metacognition'), 'always prints the discipline + watch-list scaffold');
ok(!scaffold.includes('⚠️'), 'empty memory → no chronic-recurrence flag');
ok(!/may be STALE/i.test(scaffold), 'empty memory → no recall block');

// ── 3. enriched — seeded chronic lesson surfaces the flag + the recall ───────
const memDir = mkdtempSync(join(tmpdir(), 'cortex-think-mem-'));
const seed = openMemory({ dir: memDir, enableVec: false, embed: async () => null })!;
for (let i = 0; i < 3; i++) await commitCore(seed, { dukkha: 'deadlock on the shared connection lock', magga: 'acquire locks in a fixed global order' });
closeMemory(seed);

const enriched = await run(['why does the deadlock on the shared connection lock keep happening'], { CORTEX_MEMORY_DIR: memDir }, memDir);
ok(enriched.includes('⟦cortex cognition'), 'enriched output still leads with the scaffold');
ok(enriched.includes('⚠️') && /อุทธัจจกุกกุจจะ/.test(enriched) && /seen ×3/.test(enriched), 'chronic seeded lesson → metacognition red-flag (seen ×3)');
ok(/may be STALE/i.test(enriched), 'enriched output carries the freshness-caveated recall block');
ok(enriched.indexOf('⟦cortex cognition') < enriched.indexOf('⚠️'), 'scaffold precedes the recurrence flag');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
