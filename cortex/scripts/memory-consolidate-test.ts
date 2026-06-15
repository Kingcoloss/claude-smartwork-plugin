/**
 * Consolidation deterministic GATE (Sprint 4 / S4-T6).
 * Asserts lib/consolidate.ts (transcript digest, tolerant JSON parse, write orchestration,
 * handoff safety) and the SessionEnd hook's no-op guards — end-to-end, no network. The
 * distillation LLM is an injected fake, so the happy path is fully deterministic.
 *
 * Run:  bun run cortex/scripts/memory-consolidate-test.ts
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cortex-cons-cfg-'));
const { digestTranscript, parseDistillation, writeHandoff, consolidate, buildPrompt } =
  await import('../lib/consolidate.ts');
const { openMemory, closeMemory, recallCore, recallWiki } = await import('../lib/memory.ts');

const tmp = () => mkdtempSync(join(tmpdir(), 'cortex-cons-'));
const DIM = 16;
const fakeEmbed = async (text: string): Promise<number[]> => {
  const v = new Array(DIM).fill(0);
  for (let i = 0; i < text.length; i++) v[i % DIM] += (text.charCodeAt(i) % 17) / 17;
  return v;
};

/** Write a JSONL transcript from {type, role?, content, isMeta?} rows. */
function writeTranscript(rows: any[]): string {
  const f = join(tmp(), 'transcript.jsonl');
  writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return f;
}

// ── 1. digestTranscript — prose only, tools/meta dropped, labelled ───────────
const tPath = writeTranscript([
  { type: 'user', message: { role: 'user', content: 'fix the parser bug' } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'I will add a guard.' }, { type: 'tool_use', name: 'Edit', input: {} }] } },
  { type: 'user', isMeta: true, message: { role: 'user', content: 'SYSTEM META noise should be skipped' } },
  { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'huge tool output' }] } },
  { type: 'assistant', message: { content: [{ type: 'text', text: 'Done, the guard fixed it.' }] } },
]);
const digest = digestTranscript(tPath);
ok(digest.includes('User: fix the parser bug'), 'digest keeps user prose (labelled)');
ok(digest.includes('Assistant: I will add a guard.') && digest.includes('Done, the guard fixed it.'), 'digest keeps assistant text blocks');
ok(!digest.includes('META noise'), 'isMeta entries are dropped');
ok(!digest.includes('huge tool output') && !digest.includes('tool_use'), 'tool_use / tool_result blocks are dropped');
ok(digestTranscript(join(tmp(), 'does-not-exist.jsonl')) === '', 'missing transcript → empty digest');

// digest keeps the RECENT tail within the cap
const many = Array.from({ length: 50 }, (_, i) => ({ type: 'user', message: { role: 'user', content: `turn number ${i} padding padding padding` } }));
const tailDigest = digestTranscript(writeTranscript(many), 200);
ok(tailDigest.length <= 200 && tailDigest.includes('turn number 49') && !tailDigest.includes('turn number 0'), 'digest keeps the most recent turns within maxChars');

// buildPrompt carries the digest and asks for JSON
const msgs = buildPrompt('hello digest');
ok(msgs.length === 2 && msgs[0].role === 'system' && msgs[1].content.includes('hello digest'), 'buildPrompt embeds the digest');

// ── 2. parseDistillation — tolerant JSON extraction + shape validation ───────
const good = parseDistillation('{"lessons":[{"dukkha":"crash on null","magga":"add a guard"}],"pages":[{"title":"Null Guards","body":"check before deref"}],"handoff":"pick up at step 3"}');
ok(good.lessons.length === 1 && good.lessons[0].dukkha === 'crash on null' && good.lessons[0].magga === 'add a guard', 'parses a valid lesson');
ok(good.pages.length === 1 && good.pages[0].title === 'Null Guards', 'parses a valid page');
ok(good.handoff === 'pick up at step 3', 'parses the handoff');

const wrapped = parseDistillation('Sure! Here is the JSON:\n```json\n{"lessons":[],"pages":[{"title":"X","body":"y"}],"handoff":"h"}\n```\nHope that helps.');
ok(wrapped.pages.length === 1 && wrapped.handoff === 'h', 'unwraps JSON from surrounding prose / code fence');

const dropped = parseDistillation('{"lessons":[{"samudaya":"no dukkha here"},{"dukkha":"real one"}],"pages":[{"title":"no body"}],"handoff":""}');
ok(dropped.lessons.length === 1 && dropped.lessons[0].dukkha === 'real one', 'lesson missing dukkha is dropped');
ok(dropped.pages.length === 0, 'page missing body is dropped');

ok(parseDistillation('not json at all').lessons.length === 0, 'non-JSON → empty');
ok(parseDistillation('{"lessons": [bad json').lessons.length === 0, 'malformed JSON → empty');
ok(parseDistillation(null).handoff === '', 'null input → empty');

// ── 3. writeHandoff — writes with marker, never clobbers a human file ────────
const hdir = tmp();
ok(writeHandoff(hdir, 'next: do the thing') === true, 'writeHandoff writes a new handoff');
const hpath = join(hdir, '.cortex', 'handoff.md');
ok(existsSync(hpath) && readFileSync(hpath, 'utf8').includes('cortex:auto-generated'), 'handoff file carries the cortex marker');
ok(writeHandoff(hdir, 'updated note') === true && readFileSync(hpath, 'utf8').includes('updated note'), 'overwrites a cortex-marked handoff');
ok(writeHandoff(hdir, '   ') === false, 'empty handoff → not written');

const hdir2 = tmp();
mkdirSync(join(hdir2, '.cortex'), { recursive: true });
writeFileSync(join(hdir2, '.cortex', 'handoff.md'), 'HUMAN WROTE THIS', 'utf8');
ok(writeHandoff(hdir2, 'cortex wants to overwrite') === false, 'human-authored handoff (no marker) is preserved');
ok(readFileSync(join(hdir2, '.cortex', 'handoff.md'), 'utf8') === 'HUMAN WROTE THIS', 'human handoff content is left untouched');

// ── 4. consolidate — full pipeline with an injected fake distiller ───────────
const fakeDistill = async () =>
  '{"lessons":[{"dukkha":"WAL lock contention under concurrent hooks","samudaya":"two writers","magga":"serialize the write"}],' +
  '"pages":[{"title":"SQLite WAL","body":"writers serialize, readers concurrent","tags":"sqlite,concurrency"}],' +
  '"handoff":"resume at the consolidation gate"}';

const cdir = tmp();
const h = openMemory({ dir: tmp(), embed: fakeEmbed })!;
const res = await consolidate(h, tPath, { distill: fakeDistill, cwd: cdir });
ok(res.lessons === 1 && res.pages === 1 && res.handoffWritten === true, 'consolidate reports 1 lesson + 1 page + handoff', JSON.stringify(res));

const lessons = await recallCore(h, 'WAL lock contention concurrent');
ok(lessons.some((l) => l.dukkha.includes('WAL lock contention')), 'distilled lesson is recallable from Core Memory');
const pages = await recallWiki(h, 'sqlite WAL writers readers');
ok(pages.some((p) => p.title === 'SQLite WAL'), 'distilled page is recallable from LLM-Wiki');
ok(readFileSync(join(cdir, '.cortex', 'handoff.md'), 'utf8').includes('resume at the consolidation gate'), 'consolidate wrote the handoff');

// empty digest → no distill, no writes
let distillCalled = false;
const spyDistill = async () => { distillCalled = true; return '{}'; };
const emptyRes = await consolidate(h, join(tmp(), 'nope.jsonl'), { distill: spyDistill, cwd: tmp() });
ok(emptyRes.lessons === 0 && emptyRes.pages === 0 && !distillCalled, 'no usable digest → no LLM call, nothing written');
closeMemory(h);

// ── 5. SessionEnd hook — payload guards (no network needed) ──────────────────
const hookPath = join(import.meta.dir, '..', 'hooks', 'memory-consolidate-sessionend.ts');
async function runHook(payload: unknown, cwd: string): Promise<{ out: string; code: number }> {
  const proc = Bun.spawn(['bun', hookPath], {
    cwd,
    env: { ...process.env, CORTEX_MEMORY_DIR: tmp() },
    stdin: new TextEncoder().encode(JSON.stringify(payload)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { out, code };
}

const noPath = await runHook({ reason: 'clear' }, tmp());
ok(noPath.out.trim() === '' && noPath.code === 0, 'no transcript_path → no-op, clean exit');

// transcript_path to a nonexistent file → digest '' → no distill → no handoff written
const guardCwd = tmp();
const missing = await runHook({ transcript_path: join(tmp(), 'ghost.jsonl'), cwd: guardCwd }, guardCwd);
ok(missing.code === 0 && !existsSync(join(guardCwd, '.cortex', 'handoff.md')), 'unreadable transcript → no-op, no handoff side effect');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
