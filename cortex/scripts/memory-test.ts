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
const { openMemory, closeMemory, commit, recall, fuse } = await import('../lib/memory.ts');

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

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
