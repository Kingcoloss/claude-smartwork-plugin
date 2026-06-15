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
import { inArray } from 'drizzle-orm';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from 'ulidx';
import * as vec from 'sqlite-vec';
import { getConfig, type CortexConfig } from './config.ts';
import { embed as ollamaEmbed } from './ollama.ts';
import { initSchema, initVecTable, findSqliteLib, episodic, SCHEMA_VERSION } from './schema.ts';
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
      if (v && v.length > 0) {
        if (h.dims === 0) {        // first embedding reveals the model-bound width
          h.dims = v.length;
          h.db.run('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)', ['embed_dims', String(h.dims)]);
          initVecTable(h.db, h.dims);
        }
        if (v.length === h.dims) {
          h.db.run('INSERT INTO episodic_vec(id, embedding) VALUES (?, ?)', [id, new Float32Array(v)]);
        } else {
          debug('memory', 'dims mismatch', v.length, 'expected', h.dims); // model changed → skip vec, keep FTS
        }
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
 * Hybrid recall: keyword (FTS5) ∪ semantic (vec0 KNN), fused by rank. Each retriever
 * degrades independently — no FTS terms, or no vec/ollama, just narrows the pool.
 * Returns at most `limit` hits, best first.
 */
export async function recall(
  h: MemoryHandle,
  query: string,
  opts: { limit?: number } = {},
): Promise<RecallHit[]> {
  if (!query?.trim()) return [];
  const limit = opts.limit ?? 5;
  const pool = Math.max(limit * 4, 20); // retrieve wide, fuse, then trim

  let ftsIds: string[] = [];
  const match = toMatch(query);
  if (match) {
    try {
      ftsIds = (h.db.query(
        `SELECT id FROM episodic_fts WHERE episodic_fts MATCH ? ORDER BY bm25(episodic_fts) LIMIT ?`,
      ).all(match, pool) as { id: string }[]).map((r) => r.id);
    } catch (e) { debug('memory', 'fts', (e as Error)?.message); }
  }

  let vecIds: string[] = [];
  if (h.hasVec && h.dims > 0) {
    try {
      const v = await h.embed(query);
      if (v && v.length === h.dims) {
        vecIds = (h.db.query(
          `SELECT id FROM episodic_vec WHERE embedding MATCH ? ORDER BY distance LIMIT ?`,
        ).all(new Float32Array(v), pool) as { id: string }[]).map((r) => r.id);
      }
    } catch (e) { debug('memory', 'vec', (e as Error)?.message); }
  }

  const ranked = fuse(ftsIds, vecIds, limit);
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
