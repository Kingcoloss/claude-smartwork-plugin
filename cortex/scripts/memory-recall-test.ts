/**
 * Memory recall-into-context deterministic GATE (Sprint 4 / S4-T5).
 * Asserts the pure formatRecall() output (age + freshness caveat + compaction) and
 * the UserPromptSubmit recall hook end-to-end. The hook is spawned against a temp DB
 * (seeded here) with an isolated CLAUDE_CONFIG_DIR + cwd, so recall degrades to FTS
 * keyword matching — NO ollama, NO Claude Code, fully deterministic.
 *
 * Run:  bun run cortex/scripts/memory-recall-test.ts
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// Isolate config BEFORE importing (getConfig caches; configDir() reads the env).
process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cortex-recall-cfg-'));
const { openMemory, closeMemory, commitCore, commitWiki, formatRecall } = await import('../lib/memory.ts');

import type { CoreHit, WikiHit } from '../lib/memory.ts';

const DIM = 16;
const fakeEmbed = async (text: string): Promise<number[]> => {
  const v = new Array(DIM).fill(0);
  for (let i = 0; i < text.length; i++) v[i % DIM] += (text.charCodeAt(i) % 17) / 17;
  return v;
};
const memDir = () => mkdtempSync(join(tmpdir(), 'cortex-recall-'));
const HOUR = 3_600_000, DAY = 86_400_000;
const NOW = 1_700_000_000_000; // fixed clock so age strings are deterministic

const core = (over: Partial<CoreHit> = {}): CoreHit => ({
  id: 'c1', dukkha: 'the error', samudaya: null, nirodha: null, magga: null,
  hits: 1, updatedAt: NOW, score: 1, sources: ['fts'], ...over,
});
const wiki = (over: Partial<WikiHit> = {}): WikiHit => ({
  id: 'w1', title: 'Topic', body: 'the body', tags: null, updatedAt: NOW, score: 1, sources: ['fts'], ...over,
});

// ── 1. formatRecall — pure, empty → no-op signal ─────────────────────────────
ok(formatRecall([], [], NOW) === '', 'empty lessons + knowledge → empty string (hook no-ops)');

// ── 2. formatRecall — caveat is always present ───────────────────────────────
const oneCore = formatRecall([core({ dukkha: 'TypeError x', magga: 'guard the call' })], [], NOW);
ok(/may be STALE/i.test(oneCore) && /verify against current state/i.test(oneCore),
  'block carries the stale/verify freshness caveat (Sati-Sampajañña)');

// ── 3. formatRecall — lessons: hits, fix, and the อริยสัจ4 header ─────────────
ok(oneCore.includes('Past lessons') && oneCore.includes('seen ×1'), 'lesson shows the anti-repeat hit count');
ok(oneCore.includes('TypeError x') && oneCore.includes('→ fix: guard the call'), 'lesson shows dukkha and its fix (magga)');
const noFix = formatRecall([core({ dukkha: 'unsolved bug', magga: null })], [], NOW);
ok(noFix.includes('unsolved bug') && !noFix.includes('→ fix:'), 'a lesson with no fix omits the fix clause');

// ── 4. formatRecall — knowledge section ──────────────────────────────────────
const oneWiki = formatRecall([], [wiki({ title: 'Reciprocal Rank Fusion', body: 'fuse by rank' })], NOW);
ok(oneWiki.includes('Relevant knowledge') && oneWiki.includes('Reciprocal Rank Fusion: fuse by rank'),
  'knowledge shows page title + body snippet');

// ── 5. formatRecall — coarse age strings (deterministic via fixed NOW) ───────
ok(formatRecall([core({ updatedAt: NOW })], [], NOW).includes('just now'), 'age <1m → "just now"');
ok(formatRecall([core({ updatedAt: NOW - 3 * HOUR })], [], NOW).includes('3h ago'), 'age in hours → "Nh ago"');
ok(formatRecall([core({ updatedAt: NOW - 2 * DAY })], [], NOW).includes('2d ago'), 'age in days → "Nd ago"');

// ── 6. formatRecall — both sections coexist, lessons first ───────────────────
const both = formatRecall([core({ dukkha: 'err A' })], [wiki({ title: 'Page B' })], NOW);
ok(both.indexOf('Past lessons') < both.indexOf('Relevant knowledge'), 'lessons precede knowledge');

// ── 7. recall hook end-to-end (FTS keyword recall against a seeded temp DB) ──
const dir = memDir();
const seed = openMemory({ dir, embed: fakeEmbed })!;
await commitCore(seed, { dukkha: 'Frobnicate timeout after retry exhausted', magga: 'raise the frobnicate backoff ceiling' });
await commitWiki(seed, { title: 'Frobnicate Protocol', body: 'how the frobnicate handshake works end to end' });
closeMemory(seed);

const hookPath = join(import.meta.dir, '..', 'hooks', 'memory-recall-userpromptsubmit.ts');
async function runHook(prompt: unknown): Promise<string> {
  const proc = Bun.spawn(['bun', hookPath], {
    cwd: dir, // a dir with no .claude/ so no project settings leak in
    env: { ...process.env, CORTEX_MEMORY_DIR: dir },
    stdin: new TextEncoder().encode(JSON.stringify({ prompt })),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

const hit = await runHook('how do I fix the frobnicate timeout problem');
const parsed = (() => { try { return JSON.parse(hit); } catch { return null; } })();
ok(parsed?.hookSpecificOutput?.hookEventName === 'UserPromptSubmit', 'relevant prompt → hook emits UserPromptSubmit output');
const ctx: string = parsed?.hookSpecificOutput?.additionalContext ?? '';
ok(/may be STALE/i.test(ctx), 'injected context carries the freshness caveat');
ok(ctx.includes('Frobnicate timeout after retry exhausted'), 'injected context recalls the seeded Core Memory lesson');
ok(ctx.includes('Frobnicate Protocol'), 'injected context recalls the seeded LLM-Wiki page');

const miss = await runHook('xyzzy plugh quux nothing related here');
ok(miss.trim() === '', 'irrelevant prompt → no-op (no context emitted)');
const empty = await runHook('   ');
ok(empty.trim() === '', 'empty prompt → no-op');
const control = await runHook('/cortex off');
ok(control.trim() === '', '/cortex control prompt → no-op (left to the expression hook)');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
