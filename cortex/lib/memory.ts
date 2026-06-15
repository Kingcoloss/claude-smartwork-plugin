/**
 * Memory faculty — in-process long-term store (Sprint 4 / S4-T2).
 *
 * Hooks call these functions DIRECTLY — no daemon (D11). Everything is best-effort:
 * a missing Bun/sqlite, a down ollama, or a libsqlite3 without vec each degrade to a
 * narrower-but-working path, never an exception (cooperate, not replace).
 *
 *   openMemory() — open + lazily init the db; reports whether vec0 is available.
 *   commit()     — write one episodic event: row + FTS mirror + (if embeddable) vector.
 *   recall()     — hybrid retrieval: FTS5 keyword ∪ vec0 KNN, fused by rank (see fuse()).
 *
 * Embeddings come from ollama (lib/ollama.ts); the `embed` injection seam lets the
 * gate drive both retrieval paths deterministically without a live model.
 */
import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulidx';
import * as vec from 'sqlite-vec';
import { getConfig, type CortexConfig } from './config.ts';
import { embed as ollamaEmbed } from './ollama.ts';
import { initSchema, initVecTable, findSqliteLib, episodic, coreMemory, semantic, links, SCHEMA_VERSION } from './schema.ts';
import { debug } from './log.ts';

/** Embed one text → one vector (or null). Wraps ollama; overridable in tests. */
export type EmbedFn = (text: string) => Promise<number[] | null>;

export interface MemoryHandle {
  db: Database;
  orm: BunSQLiteDatabase;
  hasVec: boolean;  // vec0 extension loaded for this handle
  dims: number;     // embedding width once known (0 = not yet)
  embed: EmbedFn;
}

export interface CommitEntry {
  content: string;
  kind?: string;                       // default 'note'
  sessionId?: string;                  // default 'default'
  meta?: Record<string, unknown>;
}

export interface RecallHit {
  id: string;
  content: string;
  kind: string;
  ts: number;
  score: number;                       // fused rank score (higher = better)
  sources: string[];                   // retrievers that found it: 'fts' and/or 'vec'
}

// setCustomSQLite is process-global and one-shot — only ever attempt it once.
let _customSqliteSet = false;

function defaultEmbed(cfg: CortexConfig): EmbedFn {
  return async (text: string) => {
    const v = await ollamaEmbed(text, { cfg });
    return v && v[0] ? v[0] : null;
  };
}

/**
 * Open (and idempotently init) the memory db. Returns null only when sqlite itself
 * is unusable or cortex/memory is disabled — every other failure degrades in place.
 */
export function openMemory(
  opts: { cfg?: CortexConfig; dir?: string; enableVec?: boolean; embed?: EmbedFn } = {},
): MemoryHandle | null {
  const cfg = opts.cfg ?? getConfig();
  if (!cfg.enabled || !cfg.memory.enabled) return null;
  const dir = opts.dir ?? cfg.memory.dir ?? join(process.cwd(), '.cortex', 'memory');
  const wantVec = opts.enableVec !== false;

  let db: Database;
  let hasVec = false;
  try {
    if (wantVec && !_customSqliteSet) {
      const lib = findSqliteLib();
      if (lib) {
        try { Database.setCustomSQLite(lib); _customSqliteSet = true; }
        catch (e) { debug('memory', 'setCustomSQLite', (e as Error)?.message); }
      }
    }
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    db = new Database(join(dir, 'cortex.db'));
    db.run('PRAGMA journal_mode = WAL');
    if (wantVec) {
      try { vec.load(db); hasVec = true; }
      catch (e) { debug('memory', 'vec.load', (e as Error)?.message); }
    }
    initSchema(db);
  } catch (e) {
    debug('memory', 'open failed', (e as Error)?.message);
    return null;
  }

  let dims = 0;
  try {
    db.run('INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)]);
    const row = db.query('SELECT value FROM meta WHERE key = ?').get('embed_dims') as { value?: string } | undefined;
    dims = row?.value ? (parseInt(row.value, 10) || 0) : 0;
    if (hasVec && dims > 0) initVecTable(db, dims);
  } catch (e) { debug('memory', 'meta', (e as Error)?.message); }

  return { db, orm: drizzle(db), hasVec, dims, embed: opts.embed ?? defaultEmbed(cfg) };
}

export function closeMemory(h: MemoryHandle | null): void {
  try { h?.db.close(); } catch {}
}

/**
 * Learn the model-bound embedding width on first sight — persist it in `meta` and
 * create the vec tables. Returns true when `len` matches the established width, i.e.
 * the caller may insert this vector (a mismatch means the embed model changed →
 * skip vec, keep FTS). Shared by episodic commit() and Core Memory commitCore().
 */
function ensureVec(h: MemoryHandle, len: number): boolean {
  if (h.dims === 0) {
    h.dims = len;
    try { h.db.run('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)', ['embed_dims', String(len)]); } catch {}
    initVecTable(h.db, len);
  }
  if (len !== h.dims) debug('memory', 'dims mismatch', len, 'expected', h.dims);
  return len === h.dims;
}

/**
 * Write one episodic event. The row + FTS mirror are committed first (cheap, always);
 * the embedding/vector is a best-effort enrichment that never blocks the write.
 * Returns the new id, or null if even the row write failed.
 */
export async function commit(h: MemoryHandle, entry: CommitEntry): Promise<string | null> {
  if (!entry?.content?.trim()) return null;
  const id = ulid();
  try {
    h.orm.insert(episodic).values({
      id,
      sessionId: entry.sessionId ?? 'default',
      ts: Date.now(),
      kind: entry.kind ?? 'note',
      content: entry.content,
      meta: entry.meta ? JSON.stringify(entry.meta) : null,
    }).run();
    h.db.run('INSERT INTO episodic_fts(id, content) VALUES (?, ?)', [id, entry.content]);
  } catch (e) {
    debug('memory', 'commit row', (e as Error)?.message);
    return null;
  }

  if (h.hasVec) {
    try {
      const v = await h.embed(entry.content);
      if (v && v.length > 0 && ensureVec(h, v.length)) {
        h.db.run('INSERT INTO episodic_vec(id, embedding) VALUES (?, ?)', [id, new Float32Array(v)]);
      }
    } catch (e) { debug('memory', 'commit vec', (e as Error)?.message); }
  }
  return id;
}

/** FTS5 MATCH expression from free text: word tokens (incl. Thai) OR-ed, each quoted
 *  so SQLite never parses user text as FTS operators. Null when there's nothing to match. */
function toMatch(query: string): string | null {
  const terms = (query.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? []);
  if (terms.length === 0) return null;
  return [...new Set(terms)].map((t) => `"${t}"`).join(' OR ');
}

/**
 * Hybrid retrieval over one FTS5/vec0 pair: keyword (bm25) ∪ semantic (vec KNN), fused
 * by rank. Each retriever degrades independently — no FTS terms, or no vec/ollama, just
 * narrows the pool. Returns ranked {id, score, sources}; hydration is the caller's job
 * (table-typed). Table names are internal constants, never user input.
 */
async function hybridSearch(
  h: MemoryHandle,
  query: string,
  ftsTable: string,
  vecTable: string,
  limit: number,
): Promise<{ id: string; score: number; sources: string[] }[]> {
  const pool = Math.max(limit * 4, 20); // retrieve wide, fuse, then trim

  let ftsIds: string[] = [];
  const match = toMatch(query);
  if (match) {
    try {
      ftsIds = (h.db.query(
        `SELECT id FROM ${ftsTable} WHERE ${ftsTable} MATCH ? ORDER BY bm25(${ftsTable}) LIMIT ?`,
      ).all(match, pool) as { id: string }[]).map((r) => r.id);
    } catch (e) { debug('memory', ftsTable, (e as Error)?.message); }
  }

  let vecIds: string[] = [];
  if (h.hasVec && h.dims > 0) {
    try {
      const v = await h.embed(query);
      if (v && v.length === h.dims) {
        vecIds = (h.db.query(
          `SELECT id FROM ${vecTable} WHERE embedding MATCH ? ORDER BY distance LIMIT ?`,
        ).all(new Float32Array(v), pool) as { id: string }[]).map((r) => r.id);
      }
    } catch (e) { debug('memory', vecTable, (e as Error)?.message); }
  }

  return fuse(ftsIds, vecIds, limit);
}

/**
 * Hybrid recall of episodic events. Returns at most `limit` hits, best first.
 */
export async function recall(
  h: MemoryHandle,
  query: string,
  opts: { limit?: number } = {},
): Promise<RecallHit[]> {
  if (!query?.trim()) return [];
  const ranked = await hybridSearch(h, query, 'episodic_fts', 'episodic_vec', opts.limit ?? 5);
  if (ranked.length === 0) return [];

  const rows = h.orm
    .select({ id: episodic.id, content: episodic.content, kind: episodic.kind, ts: episodic.ts })
    .from(episodic)
    .where(inArray(episodic.id, ranked.map((r) => r.id)))
    .all();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ranked
    .map((r) => {
      const row = byId.get(r.id);
      return row ? { ...row, score: r.score, sources: r.sources } : null;
    })
    .filter((x): x is RecallHit => x !== null);
}

/**
 * Reciprocal Rank Fusion — merge the FTS and vec ranked id-lists into one order.
 *
 * Why fuse by RANK, not score: bm25 scores and vec distances live on different,
 * incomparable scales, so normalizing them is fragile. Instead each list contributes
 * 1/(K + rank) to an id's total; ids surfaced by BOTH retrievers accumulate from both
 * and rise to the top. K (=60, the standard) dampens the long tail so a #1 in one list
 * still outweighs a #40 in the other.
 *
 * ── Tunable decision point ──
 * This is the spot where recall "personality" lives. Alternatives worth trying:
 *   • weighted RRF — bias toward keyword (identifiers/paths) or semantic (paraphrase)
 *   • vec-rerank   — take FTS top-N, reorder purely by vector distance
 *   • score-norm   — min-max normalize bm25 & distance, then weighted sum
 * Swap the body below to reshape it; the recall() contract (id list in → ranked out) holds.
 */
const RRF_K = 60;
export function fuse(
  ftsIds: string[],
  vecIds: string[],
  limit: number,
): { id: string; score: number; sources: string[] }[] {
  const acc = new Map<string, { score: number; sources: Set<string> }>();
  const add = (ids: string[], source: string) => {
    ids.forEach((id, i) => {
      const cur = acc.get(id) ?? { score: 0, sources: new Set<string>() };
      cur.score += 1 / (RRF_K + i + 1);
      cur.sources.add(source);
      acc.set(id, cur);
    });
  };
  add(ftsIds, 'fts');
  add(vecIds, 'vec');
  return [...acc.entries()]
    .map(([id, v]) => ({ id, score: v.score, sources: [...v.sources] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Memory — อริยสัจ4 anti-repeat ledger (S4-T3)
// ทุกข์(dukkha=error) → สมุทัย(samudaya=cause) → นิโรธ(nirodha=resolved) → มรรค(magga=fix path).
// Two retrieval needs, kept separate by design (per the fusion analysis):
//   • dedup-on-write  = EXACT signature match + a `hits` counter (the anti-repeat signal)
//   • recall-on-read  = hybrid FTS ∪ vec via the same RRF fuse() episodic recall uses
// ─────────────────────────────────────────────────────────────────────────────

export interface CoreEntry {
  dukkha: string;    // the error/problem (required — the dedup key)
  samudaya?: string; // root cause
  nirodha?: string;  // the resolved state
  magga?: string;    // the fix path
}

export interface CoreHit {
  id: string;
  dukkha: string;
  samudaya: string | null;
  nirodha: string | null;
  magga: string | null;
  hits: number;      // times this error recurred (higher = more chronic)
  updatedAt: number; // last seen/merged (epoch ms) — feeds the freshness caveat (S4-T5)
  score: number;
  sources: string[];
}

/**
 * Stable dedup signature for an error. Normalizes away the VOLATILE parts that differ
 * between two occurrences of the *same* error — UUIDs, hex addresses, timestamps, quoted
 * literal values, file:line:col positions, bare numbers — then hashes what's left (the
 * error type + structural message + symbol names). Same error, different run → same sig.
 *
 * ── Tunable decision point (anti-repeat precision) ──
 * Strip MORE → more occurrences collapse into one ledger entry (aggressive dedup, but two
 * genuinely-different errors can merge). Strip LESS → the same error with a shifted line
 * number counts as new (anti-repeat misses it). The rules below are the Sentry-style
 * default; adjust them to tune how cortex decides "this is the same mistake as before."
 * (Order matters: UUID/timestamp before the bare-number rule, or digits get eaten first.)
 */
export function signatureOf(dukkha: string): string {
  const normalized = (dukkha ?? '')
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '<uuid>')
    .replace(/0x[0-9a-f]+/g, '<addr>')
    .replace(/\d{4}-\d{2}-\d{2}[t ][\d:.]+z?/g, '<ts>')
    .replace(/(['"`])[^'"`]*\1/g, '<str>')
    .replace(/:\d+(?::\d+)?/g, ':<pos>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/** Keep a core row's FTS5 mirror in sync (full delete+reinsert). Sync, best-effort. */
function syncCoreFts(
  h: MemoryHandle,
  id: string,
  dukkha: string,
  f: { samudaya: string | null; nirodha: string | null; magga: string | null },
): void {
  try {
    h.db.run('DELETE FROM core_fts WHERE id = ?', [id]);
    h.db.run('INSERT INTO core_fts(id, dukkha, samudaya, nirodha, magga) VALUES (?, ?, ?, ?, ?)',
      [id, dukkha, f.samudaya ?? '', f.nirodha ?? '', f.magga ?? '']);
  } catch (e) { debug('memory', 'core fts sync', (e as Error)?.message); }
}

/** Keep an upsert-kind's vec0 mirror in sync by embedding `text` (delete+reinsert).
 *  Async, best-effort; `table` is an internal constant. Shared by core + semantic. */
async function syncVec(h: MemoryHandle, table: string, id: string, text: string): Promise<void> {
  if (!h.hasVec) return;
  try {
    const v = await h.embed(text);
    if (v && v.length > 0 && ensureVec(h, v.length)) {
      h.db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
      h.db.run(`INSERT INTO ${table}(id, embedding) VALUES (?, ?)`, [id, new Float32Array(v)]);
    }
  } catch (e) { debug('memory', `${table} vec sync`, (e as Error)?.message); }
}

/**
 * Record an error→cause→fix lesson with EXACT-signature dedup. A recurrence (same
 * signature) bumps `hits` and refreshes cause/fix with any newer, non-empty understanding
 * instead of inserting a duplicate — that growing `hits` IS the anti-repeat signal. The
 * row's `dukkha` keeps its first-seen text so the search mirrors stay consistent.
 * Returns the row id + whether it deduped, or null if even the row write failed.
 */
export async function commitCore(
  h: MemoryHandle,
  entry: CoreEntry,
): Promise<{ id: string; deduped: boolean } | null> {
  if (!entry?.dukkha?.trim()) return null;
  const sig = signatureOf(entry.dukkha);
  const now = Date.now();

  let id: string;
  let deduped: boolean;
  let ftsDukkha: string;
  let linkText = ''; // cause/fix prose — parsed for [[wiki-links]] to connect the lesson to knowledge
  try {
    const existing = h.orm
      .select({
        id: coreMemory.id, dukkha: coreMemory.dukkha, samudaya: coreMemory.samudaya,
        nirodha: coreMemory.nirodha, magga: coreMemory.magga, hits: coreMemory.hits,
      })
      .from(coreMemory).where(eq(coreMemory.signature, sig)).get();

    if (existing) {
      const merged = {
        samudaya: entry.samudaya?.trim() || existing.samudaya,
        nirodha: entry.nirodha?.trim() || existing.nirodha,
        magga: entry.magga?.trim() || existing.magga,
      };
      h.orm.update(coreMemory)
        .set({ ...merged, hits: existing.hits + 1, updatedAt: now })
        .where(eq(coreMemory.id, existing.id)).run();
      id = existing.id; deduped = true; ftsDukkha = existing.dukkha;
      syncCoreFts(h, id, ftsDukkha, merged);
      linkText = [merged.samudaya, merged.nirodha, merged.magga].filter(Boolean).join('\n');
    } else {
      id = ulid(); deduped = false; ftsDukkha = entry.dukkha;
      const fields = {
        samudaya: entry.samudaya ?? null, nirodha: entry.nirodha ?? null, magga: entry.magga ?? null,
      };
      h.orm.insert(coreMemory).values({
        id, signature: sig, dukkha: entry.dukkha, ...fields, hits: 1, createdAt: now, updatedAt: now,
      }).run();
      syncCoreFts(h, id, ftsDukkha, fields);
      linkText = [fields.samudaya, fields.nirodha, fields.magga].filter(Boolean).join('\n');
    }
  } catch (e) {
    debug('memory', 'commitCore', (e as Error)?.message);
    return null;
  }

  setWikiLinks(h, 'core', id, linkText);       // lesson → concept-page edges (augments Core Memory)
  await syncVec(h, 'core_vec', id, ftsDukkha); // best-effort enrichment, outside the row write
  return { id, deduped };
}

/**
 * Hybrid recall over the Core Memory ledger — "have I hit something like this before,
 * and what fixed it?" Returns the full อริยสัจ4 record + recurrence count, best first.
 */
export async function recallCore(
  h: MemoryHandle,
  query: string,
  opts: { limit?: number } = {},
): Promise<CoreHit[]> {
  if (!query?.trim()) return [];
  const ranked = await hybridSearch(h, query, 'core_fts', 'core_vec', opts.limit ?? 5);
  if (ranked.length === 0) return [];

  const rows = h.orm
    .select({
      id: coreMemory.id, dukkha: coreMemory.dukkha, samudaya: coreMemory.samudaya,
      nirodha: coreMemory.nirodha, magga: coreMemory.magga, hits: coreMemory.hits,
      updatedAt: coreMemory.updatedAt,
    })
    .from(coreMemory)
    .where(inArray(coreMemory.id, ranked.map((r) => r.id)))
    .all();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ranked
    .map((r) => {
      const row = byId.get(r.id);
      return row ? { ...row, score: r.score, sources: r.sources } : null;
    })
    .filter((x): x is CoreHit => x !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM-Wiki — semantic distilled-concept pages (S4-T4, Karpathy's LLM-Wiki concept)
// Domain-agnostic: a "page" is any distilled, reusable concept — a definition, a lesson,
// a pattern, a how-to — keyed by title (one page per concept, upserted/kept-current). The
// body is markdown and may carry [[wiki-links]] that become navigation edges (see graph
// section below). This is the STORE; distillation that GENERATES pages = consolidation (S4-T6).
// ─────────────────────────────────────────────────────────────────────────────

export interface WikiEntry {
  title: string;   // the concept name (the dedup key — one page per title)
  body: string;    // the distilled content
  tags?: string;   // optional comma list
}

export interface WikiHit {
  id: string;
  title: string;
  body: string;
  tags: string | null;
  updatedAt: number; // last edited (epoch ms) — feeds the freshness caveat (S4-T5)
  score: number;
  sources: string[];
}

/** Keep a wiki page's FTS5 mirror in sync (delete+reinsert). Sync, best-effort. */
function syncSemanticFts(h: MemoryHandle, id: string, title: string, body: string, tags: string | null): void {
  try {
    h.db.run('DELETE FROM semantic_fts WHERE id = ?', [id]);
    h.db.run('INSERT INTO semantic_fts(id, title, body, tags) VALUES (?, ?, ?, ?)', [id, title, body, tags ?? '']);
  } catch (e) { debug('memory', 'semantic fts sync', (e as Error)?.message); }
}

/**
 * Upsert a distilled concept page, keyed by title (case-insensitive): an existing page
 * with the same title has its body/tags refreshed (the wiki model — one page per concept,
 * edited over time) rather than duplicated; the stored title keeps its first-seen casing so
 * the search mirrors stay consistent. Returns the id + whether it updated an existing page,
 * or null if title/body is empty or the row write failed.
 */
export async function commitWiki(
  h: MemoryHandle,
  entry: WikiEntry,
): Promise<{ id: string; updated: boolean } | null> {
  if (!entry?.title?.trim() || !entry?.body?.trim()) return null;
  const now = Date.now();
  const tags = entry.tags?.trim() || null;

  let id: string;
  let updated: boolean;
  let title: string;
  try {
    const existing = h.orm.select({ id: semantic.id, title: semantic.title }).from(semantic)
      .where(sql`lower(${semantic.title}) = lower(${entry.title})`).get();
    if (existing) {
      h.orm.update(semantic).set({ body: entry.body, tags, updatedAt: now }).where(eq(semantic.id, existing.id)).run();
      id = existing.id; updated = true; title = existing.title;
    } else {
      id = ulid(); updated = false; title = entry.title;
      h.orm.insert(semantic).values({ id, title, body: entry.body, tags, createdAt: now, updatedAt: now }).run();
    }
    syncSemanticFts(h, id, title, entry.body, tags);
  } catch (e) {
    debug('memory', 'commitWiki', (e as Error)?.message);
    return null;
  }

  setWikiLinks(h, 'semantic', id, entry.body);                    // [[wiki-links]] → edges
  await syncVec(h, 'semantic_vec', id, `${title}\n${entry.body}`); // embed title+body for semantic match
  return { id, updated };
}

/** Hybrid recall over LLM-Wiki pages — the distilled concept relevant to a query. */
export async function recallWiki(
  h: MemoryHandle,
  query: string,
  opts: { limit?: number } = {},
): Promise<WikiHit[]> {
  if (!query?.trim()) return [];
  const ranked = await hybridSearch(h, query, 'semantic_fts', 'semantic_vec', opts.limit ?? 5);
  if (ranked.length === 0) return [];

  const rows = h.orm
    .select({ id: semantic.id, title: semantic.title, body: semantic.body, tags: semantic.tags, updatedAt: semantic.updatedAt })
    .from(semantic)
    .where(inArray(semantic.id, ranked.map((r) => r.id)))
    .all();
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ranked
    .map((r) => {
      const row = byId.get(r.id);
      return row ? { ...row, score: r.score, sources: r.sources } : null;
    })
    .filter((x): x is WikiHit => x !== null);
}

export interface WikiPage { id: string; title: string; tags: string | null; updatedAt: number; }

/** List all LLM-Wiki pages, newest-edited first — the catalog behind `/cortex-recall --index`. */
export function listWiki(h: MemoryHandle, limit = 100): WikiPage[] {
  try {
    return h.orm
      .select({ id: semantic.id, title: semantic.title, tags: semantic.tags, updatedAt: semantic.updatedAt })
      .from(semantic).orderBy(desc(semantic.updatedAt)).limit(limit).all();
  } catch (e) {
    debug('memory', 'listWiki', (e as Error)?.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recall-into-context — the freshness-caveated injection block (S4-T5)
// Sati-Sampajañña: recall tells you what happened BEFORE; it is not a claim about
// what is true NOW. So every injected item carries its age and the block is fenced
// with a "may be stale — verify against current state" caveat — recall informs, it
// never overrides present reality (mirrors native CC's own stale-memory guidance).
// ─────────────────────────────────────────────────────────────────────────────

/** Coarse human age of an epoch-ms timestamp ("just now" → "Nmo ago"). */
export function ago(now: number, then: number): string {
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

/**
 * Render recalled lessons + knowledge into one compact context block for a hook to
 * inject, or '' when there's nothing (→ the hook no-ops). Pure: takes `now` so age is
 * deterministic and testable. Lessons lead (the anti-repeat signal: "seen ×N" + fix),
 * then knowledge; snippets are clamped so per-prompt injection stays cheap.
 */
export function formatRecall(core: CoreHit[], wiki: WikiHit[], now: number): string {
  if (core.length === 0 && wiki.length === 0) return '';
  const lines = ['⟦cortex recall — from memory; may be STALE, verify against current state before relying on it⟧'];
  if (core.length) {
    lines.push('Past lessons (อริยสัจ4 / Core Memory):');
    for (const c of core) {
      const fix = c.magga?.trim() ? ` → fix: ${snippet(c.magga)}` : '';
      lines.push(`- (seen ×${c.hits}, ${ago(now, c.updatedAt)}) ${snippet(c.dukkha)}${fix}`);
    }
  }
  if (wiki.length) {
    lines.push('Relevant knowledge (LLM-Wiki):');
    for (const w of wiki) lines.push(`- (${ago(now, w.updatedAt)}) ${w.title}: ${snippet(w.body)}`);
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-reference graph — navigation across memory kinds (S4-T4)
// [[wiki-links]] in a page body (or a Core Memory's cause/fix) become directed edges,
// so a lesson connects to the knowledge that explains it, and either can be navigated.
// ─────────────────────────────────────────────────────────────────────────────

export interface Neighbor {
  kind: string;        // 'semantic' | 'core' | 'episodic'
  id: string;
  label: string;       // page title / lesson dukkha / event snippet
  relation: string | null;
  dir: 'out' | 'in';   // out = this node links to it; in = it links to this node
}

/** Pull distinct [[Wiki Link]] targets out of free text. */
function parseWikiLinks(text: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^[\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text ?? '')) !== null) {
    const t = m[1].trim();
    if (t) out.push(t);
  }
  return [...new Set(out)];
}

/** Create or replace one directed edge between memory items. Best-effort. */
export function link(
  h: MemoryHandle,
  srcKind: string, srcId: string,
  dstKind: string, dstId: string,
  relation: string | null = null,
): void {
  try {
    h.orm.insert(links).values({ srcKind, srcId, dstKind, dstId, relation })
      .onConflictDoUpdate({
        target: [links.srcKind, links.srcId, links.dstKind, links.dstId],
        set: { relation },
      }).run();
  } catch (e) { debug('memory', 'link', (e as Error)?.message); }
}

/**
 * Reconcile a source's auto 'wiki-link' edges from the [[links]] in `text`: clear its
 * prior wiki-links (so edits don't leave stale ones), then add an edge to each [[Title]]
 * that resolves to an existing semantic page. Unresolved links are dropped (a known
 * "missing cross-reference" — lint territory). Explicit link() edges are left untouched.
 */
function setWikiLinks(h: MemoryHandle, srcKind: string, srcId: string, text: string): void {
  try {
    h.orm.delete(links)
      .where(and(eq(links.srcKind, srcKind), eq(links.srcId, srcId), eq(links.relation, 'wiki-link')))
      .run();
    for (const title of parseWikiLinks(text)) {
      const page = h.orm.select({ id: semantic.id }).from(semantic)
        .where(sql`lower(${semantic.title}) = lower(${title})`).get();
      if (page && !(srcKind === 'semantic' && page.id === srcId)) { // skip self-links
        link(h, srcKind, srcId, 'semantic', page.id, 'wiki-link');
      }
    }
  } catch (e) { debug('memory', 'setWikiLinks', (e as Error)?.message); }
}

const snippet = (s: string): string => (s.length > 80 ? s.slice(0, 80) + '…' : s);

/** Human-readable label for a node (page title / lesson / event), or the id as fallback. */
function labelOf(h: MemoryHandle, kind: string, id: string): string {
  try {
    if (kind === 'semantic') {
      const r = h.orm.select({ t: semantic.title }).from(semantic).where(eq(semantic.id, id)).get();
      return r?.t ?? id;
    }
    if (kind === 'core') {
      const r = h.orm.select({ t: coreMemory.dukkha }).from(coreMemory).where(eq(coreMemory.id, id)).get();
      return r ? snippet(r.t) : id;
    }
    if (kind === 'episodic') {
      const r = h.orm.select({ t: episodic.content }).from(episodic).where(eq(episodic.id, id)).get();
      return r ? snippet(r.t) : id;
    }
    return id;
  } catch { return id; }
}

/**
 * Navigate the graph around one node: everything it links to (out) and everything that
 * links to it (in), hydrated to readable labels. The basis for "see the connections of a
 * memory" — e.g. neighbors('core', lessonId) surfaces the concept pages behind a lesson.
 */
export function neighbors(h: MemoryHandle, kind: string, id: string): Neighbor[] {
  try {
    const out = h.orm.select({ kind: links.dstKind, id: links.dstId, relation: links.relation })
      .from(links).where(and(eq(links.srcKind, kind), eq(links.srcId, id))).all();
    const inc = h.orm.select({ kind: links.srcKind, id: links.srcId, relation: links.relation })
      .from(links).where(and(eq(links.dstKind, kind), eq(links.dstId, id))).all();
    return [
      ...out.map((e) => ({ kind: e.kind, id: e.id, label: labelOf(h, e.kind, e.id), relation: e.relation, dir: 'out' as const })),
      ...inc.map((e) => ({ kind: e.kind, id: e.id, label: labelOf(h, e.kind, e.id), relation: e.relation, dir: 'in' as const })),
    ];
  } catch (e) {
    debug('memory', 'neighbors', (e as Error)?.message);
    return [];
  }
}
