/**
 * Memory faculty deterministic GATE (Sprint 4 / S4-T1+T2).
 * Asserts lib/schema.ts + lib/memory.ts end-to-end, exiting non-zero on any failure.
 * Isolation: an isolated CLAUDE_CONFIG_DIR + a temp memory dir; embeddings are a
 * deterministic injected fake (same text → same vector), so NO ollama / Claude Code.
 *
 * On a machine with a full libsqlite3 (Homebrew) the vec0 path runs for real; the
 * FTS-only fallback is forced explicitly via enableVec:false so both paths are gated.
 *
 * Run:  bun run cortex/scripts/memory-test.ts
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
process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cortex-mem-cfg-'));
const { openMemory, closeMemory, commit, recall, fuse, commitCore, recallCore, signatureOf, commitWiki, recallWiki, link, neighbors } =
  await import('../lib/memory.ts');

/** Deterministic 16-d embedding: identical text → identical vector (distance 0). */
const DIM = 16;
const fakeEmbed = async (text: string): Promise<number[]> => {
  const v = new Array(DIM).fill(0);
  for (let i = 0; i < text.length; i++) v[i % DIM] += (text.charCodeAt(i) % 17) / 17;
  return v;
};
const nullEmbed = async (): Promise<number[] | null> => null;
const memDir = () => mkdtempSync(join(tmpdir(), 'cortex-mem-'));

// ── 1. fuse() — Reciprocal Rank Fusion, pure ────────────────────────────────
ok(fuse([], [], 5).length === 0, 'fuse of two empty lists is empty');
const both = fuse(['x', 'y'], ['y', 'z'], 5);
ok(both.length === 3, 'fuse unions distinct ids', JSON.stringify(both.map((b) => b.id)));
ok(both[0].id === 'y', 'id found by BOTH retrievers ranks first');
ok(both[0].sources.includes('fts') && both[0].sources.includes('vec'), 'shared id carries both sources');
ok(fuse(['a', 'b', 'c'], [], 2).length === 2, 'fuse respects the limit');

// ── 2. hybrid commit → recall (vec available on this host) ───────────────────
const h = openMemory({ dir: memDir(), embed: fakeEmbed })!;
ok(h !== null, 'openMemory returns a handle');
ok(h.hasVec === true, 'vec0 loaded (Homebrew libsqlite3 present)');

const idA = await commit(h, { content: 'alpha bravo charlie delta', kind: 'note' });
await commit(h, { content: 'completely unrelated payload echo foxtrot' });
ok(typeof idA === 'string' && idA!.length === 26, 'commit returns a ULID');
ok(h.dims === DIM, 'first embedding sets embed_dims', String(h.dims));

const hybrid = await recall(h, 'alpha bravo charlie delta');
ok(hybrid.length >= 1 && hybrid[0].id === idA, 'recall returns the matching event first');
ok(hybrid[0].sources.includes('fts') && hybrid[0].sources.includes('vec'),
  'top hit found by BOTH fts and vec', hybrid[0].sources.join('+'));

const kw = await recall(h, 'bravo');
ok(kw.some((r) => r.id === idA), 'keyword-only recall finds the event via FTS');
closeMemory(h);

// ── 3. FTS-only fallback (vec forced off) ────────────────────────────────────
const hf = openMemory({ dir: memDir(), embed: fakeEmbed, enableVec: false })!;
ok(hf.hasVec === false, 'enableVec:false disables vec');
const idF = await commit(hf, { content: 'sqlite golf hotel india' });
const ftsOnly = await recall(hf, 'golf hotel');
ok(ftsOnly.some((r) => r.id === idF), 'FTS-only mode still recalls');
ok(ftsOnly.every((r) => r.sources.length === 1 && r.sources[0] === 'fts'), 'FTS-only hits carry only the fts source');
closeMemory(hf);

// ── 4. dims persisted across reopen ──────────────────────────────────────────
const persistDir = memDir();
const h1 = openMemory({ dir: persistDir, embed: fakeEmbed })!;
await commit(h1, { content: 'juliet kilo lima' });
closeMemory(h1);
const h2 = openMemory({ dir: persistDir, embed: fakeEmbed })!;
ok(h2.dims === DIM, 'reopened handle reads embed_dims from meta', String(h2.dims));
closeMemory(h2);

// ── 5. graceful: embedding unavailable → row still written, FTS still recalls ─
const hg = openMemory({ dir: memDir(), embed: nullEmbed })!;
const idG = await commit(hg, { content: 'mike november oscar papa' });
ok(typeof idG === 'string', 'commit succeeds even when embedding returns null');
const g = await recall(hg, 'november oscar');
ok(g.some((r) => r.id === idG), 'no-embedding event is still recallable via FTS');
closeMemory(hg);

// ── 6. edge cases: empty query + adversarial FTS input never throw ───────────
const he = openMemory({ dir: memDir(), embed: fakeEmbed })!;
await commit(he, { content: 'quebec romeo sierra' });
ok((await recall(he, '')).length === 0, 'empty query returns no hits');
ok((await recall(he, '   ')).length === 0, 'whitespace query returns no hits');
let threw = false;
try { await recall(he, 'romeo "OR (sierra* AND'); } catch { threw = true; }
ok(!threw, 'adversarial FTS syntax is sanitized, never throws');
closeMemory(he);

// ── 7. Core Memory — signature dedup (อริยสัจ4 anti-repeat) ──────────────────
ok(signatureOf('TypeError at foo.ts:42') === signatureOf('TypeError at foo.ts:88'),
  'signature ignores line numbers (same error, diff position)');
ok(signatureOf('failed 2026-06-15T10:00:00Z') === signatureOf('failed 2026-06-15T23:59:59Z'),
  'signature ignores timestamps');
ok(signatureOf('cannot find "alpha"') === signatureOf('cannot find "bravo"'),
  'signature ignores quoted literal values');
ok(signatureOf('TypeError: x') !== signatureOf('RangeError: y'),
  'genuinely different errors get different signatures');

const hc = openMemory({ dir: memDir(), embed: fakeEmbed })!;
const c1 = await commitCore(hc, { dukkha: 'TypeError: cannot read x at app.ts:10', samudaya: 'null guard missing' });
ok(c1 !== null && c1!.deduped === false, 'first core entry is not a dedup');
const c2 = await commitCore(hc, { dukkha: 'TypeError: cannot read x at app.ts:57', magga: 'add optional chaining' });
ok(c2 !== null && c2!.deduped === true && c2!.id === c1!.id, 'same error (diff line) dedups onto the same row');

const core = await recallCore(hc, 'TypeError cannot read x');
ok(core.length >= 1 && core[0].id === c1!.id, 'recallCore surfaces the lesson');
ok(core[0].hits === 2, 'recurrence bumped the hits counter', String(core[0]?.hits));
ok(core[0].samudaya === 'null guard missing' && core[0].magga === 'add optional chaining',
  'dedup merged the cause and the later-supplied fix');
ok(core[0].sources.includes('fts') && core[0].sources.includes('vec'), 'core recall is hybrid (fts+vec)');
ok((await commitCore(hc, { dukkha: '   ' })) === null, 'empty dukkha is rejected');
ok((await recallCore(hc, '')).length === 0, 'empty core query returns no hits');
closeMemory(hc);

// Core Memory FTS-only fallback
const hcf = openMemory({ dir: memDir(), embed: fakeEmbed, enableVec: false })!;
await commitCore(hcf, { dukkha: 'ECONNREFUSED postgres on startup', magga: 'wait for db health' });
const cf = await recallCore(hcf, 'ECONNREFUSED postgres');
ok(cf.some((r) => r.magga === 'wait for db health'), 'core recall works FTS-only');
ok(cf.every((r) => r.sources.length === 1 && r.sources[0] === 'fts'), 'FTS-only core hits carry only the fts source');
closeMemory(hcf);

// ── 8. LLM-Wiki — distilled concept pages (upsert by title) ──────────────────
const hw = openMemory({ dir: memDir(), embed: fakeEmbed })!;
const w1 = await commitWiki(hw, { title: 'RRF Fusion', body: 'reciprocal rank fusion merges ranked lists', tags: 'recall,ranking' });
ok(w1 !== null && w1!.updated === false, 'first wiki page is an insert');
const w2 = await commitWiki(hw, { title: 'rrf fusion', body: 'merge fts and vec lists by rank with K=60' });
ok(w2 !== null && w2!.updated === true && w2!.id === w1!.id, 'same title (diff case) upserts the same page');

const wiki = await recallWiki(hw, 'reciprocal rank fusion');
ok(wiki.length >= 1 && wiki[0].id === w1!.id, 'recallWiki surfaces the page');
ok(wiki[0].body.includes('K=60'), 'upsert refreshed the body', wiki[0]?.body);
ok(wiki[0].sources.includes('fts') && wiki[0].sources.includes('vec'), 'wiki recall is hybrid (fts+vec)');
ok((await commitWiki(hw, { title: 'x', body: '   ' })) === null, 'empty body is rejected');
ok((await commitWiki(hw, { title: '  ', body: 'y' })) === null, 'empty title is rejected');
ok((await recallWiki(hw, '')).length === 0, 'empty wiki query returns no hits');
closeMemory(hw);

// LLM-Wiki FTS-only fallback
const hwf = openMemory({ dir: memDir(), embed: fakeEmbed, enableVec: false })!;
await commitWiki(hwf, { title: 'Graceful Degradation', body: 'cortex never blocks native Claude Code' });
const wf = await recallWiki(hwf, 'graceful degradation');
ok(wf.some((r) => r.title === 'Graceful Degradation'), 'wiki recall works FTS-only');
ok(wf.every((r) => r.sources.length === 1 && r.sources[0] === 'fts'), 'FTS-only wiki hits carry only the fts source');
closeMemory(hwf);

// ── 9. Cross-reference graph — navigation + augment Core Memory ──────────────
const hgr = openMemory({ dir: memDir(), embed: fakeEmbed })!;
const pB = (await commitWiki(hgr, { title: 'Hybrid Recall', body: 'fts union vec' }))!;
const pA = (await commitWiki(hgr, { title: 'RRF Fusion', body: 'fuses lists; see [[Hybrid Recall]] for the union' }))!;

let nA = neighbors(hgr, 'semantic', pA.id);
ok(nA.some((n) => n.dir === 'out' && n.id === pB.id && n.relation === 'wiki-link'), '[[link]] creates an out edge to the resolved page');
ok(nA.find((n) => n.id === pB.id)?.label === 'Hybrid Recall', 'neighbor is hydrated to the page title');
ok(neighbors(hgr, 'semantic', pB.id).some((n) => n.dir === 'in' && n.id === pA.id), 'backlink: the target sees the incoming edge');

// editing out the [[link]] removes the stale edge
await commitWiki(hgr, { title: 'RRF Fusion', body: 'fuses ranked lists (no link now)' });
nA = neighbors(hgr, 'semantic', pA.id);
ok(!nA.some((n) => n.id === pB.id), 'editing out a [[link]] removes the stale edge');

// Core Memory lesson links to a concept page (augments Core Memory)
const cm = (await commitCore(hgr, { dukkha: 'picked wrong fusion', magga: 'use [[Hybrid Recall]] instead' }))!;
ok(neighbors(hgr, 'core', cm.id).some((n) => n.dir === 'out' && n.id === pB.id), 'a Core Memory lesson links out to its concept page');
ok(neighbors(hgr, 'semantic', pB.id).some((n) => n.kind === 'core' && n.id === cm.id), 'the concept page backlinks to the lesson');

// unresolved [[link]] → no edge, no throw
const pU = (await commitWiki(hgr, { title: 'Orphan', body: 'refs [[Does Not Exist]]' }))!;
ok(neighbors(hgr, 'semantic', pU.id).length === 0, 'an unresolved [[link]] creates no edge');

// explicit link() primitive (custom relation, preserved across wiki-link reconcile)
link(hgr, 'semantic', pA.id, 'semantic', pB.id, 'see-also');
ok(neighbors(hgr, 'semantic', pA.id).some((n) => n.id === pB.id && n.relation === 'see-also'), 'explicit link() connects two nodes');
closeMemory(hgr);

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
