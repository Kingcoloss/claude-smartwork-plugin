/**
 * cortex-recall / cortex-remember CLI deterministic GATE (Sprint 4 / S4-T7).
 * Spawns both scripts end-to-end against one shared temp DB (isolated CLAUDE_CONFIG_DIR
 * + CORTEX_MEMORY_DIR), so remember→recall→index round-trips with NO ollama (recall
 * degrades to FTS keyword; commit writes the row+FTS first, embedding is best-effort).
 *
 * Run:  bun run cortex/scripts/cortex-cli-test.ts
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

const CFG = mkdtempSync(join(tmpdir(), 'cortex-cli-cfg-'));
const MEM = mkdtempSync(join(tmpdir(), 'cortex-cli-mem-'));
const recallScript = join(import.meta.dir, 'cortex-recall.ts');
const rememberScript = join(import.meta.dir, 'cortex-remember.ts');

async function run(script: string, args: string[]): Promise<{ out: string; code: number }> {
  const proc = Bun.spawn(['bun', script, ...args], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: CFG, CORTEX_MEMORY_DIR: MEM },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { out, code };
}

// ── 1. cortex-remember — write a lesson, then a recurrence, then a page ──────
const l1 = await run(rememberScript, ['--lesson', 'flaky test on parser timeout edgecase', '--cause', 'shared global state', '--fix', 'isolate the fixture']);
ok(l1.code === 0 && /remembered a lesson \(new\)/.test(l1.out), 'remember --lesson writes a new lesson', l1.out.trim());

const l2 = await run(rememberScript, ['--lesson', 'flaky test on parser timeout edgecase', '--fix', 'isolate the fixture']);
ok(/recurrence — hits bumped/.test(l2.out), 'same lesson again → dedup, hits bumped (not duplicated)', l2.out.trim());

const p1 = await run(rememberScript, ['--page', 'Fixture Isolation', '--body', 'each test owns its fixture; never share mutable global state', '--tags', 'testing,isolation']);
ok(p1.code === 0 && /remembered a page \(new\)/.test(p1.out), 'remember --page writes a new page', p1.out.trim());

const p2 = await run(rememberScript, ['--page', 'fixture isolation', '--body', 'updated: prefer per-test temp dirs', '--tags', 'testing,isolation']);
ok(/remembered a page \(updated\)/.test(p2.out), 'same title (case-insensitive) → upsert, page updated', p2.out.trim());

const bad = await run(rememberScript, ['--whoops', 'nothing useful']);
ok(bad.code === 1 && /usage:/.test(bad.out), 'no valid shape → usage line, exit 1');

// ── 2. cortex-recall — query finds the stored lesson + page, with the caveat ─
const rq = await run(recallScript, ['parser timeout flaky fixture']);
ok(/may be STALE/i.test(rq.out), 'recall output carries the freshness caveat');
ok(rq.out.includes('flaky test on parser timeout edgecase'), 'recall surfaces the stored lesson');
ok(rq.out.includes('Fixture Isolation'), 'recall surfaces the stored page');

const miss = await run(recallScript, ['totally unrelated zzzphlx topic']);
ok(/nothing relevant/.test(miss.out), 'irrelevant query → "nothing relevant"');

const noq = await run(recallScript, []);
ok(/pass a query, or --index/.test(noq.out), 'no query → guidance, exit 0');

// ── 3. cortex-recall --index — the LLM-Wiki catalog ──────────────────────────
const idx = await run(recallScript, ['--index']);
ok(/cortex LLM-Wiki — 1 page/.test(idx.out) && idx.out.includes('Fixture Isolation'), 'index lists the catalog (1 page, first-seen title casing)', idx.out.trim());
ok(idx.out.includes('[testing,isolation]'), 'index shows page tags');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
