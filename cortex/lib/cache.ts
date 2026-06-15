/**
 * Reversible cache (Sprint 2 / S2-T4 primitive, pulled forward so T3's
 * replacement stays reversible).
 *
 * Before Perception replaces a tool output with a compressed digest, it stores
 * the verbatim original here, keyed by content hash. The replacement carries a
 * pointer (`cat .cortex-cache/<id>.txt`) so Claude can recover the exact text on
 * demand — compression is never lossy from Claude's side, only deferred.
 *
 * Best-effort: any write failure returns null so the caller REFUSES to replace
 * (we never drop the original just because the cache is unwritable).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = '.cortex-cache';

export interface Cached {
  /** 16-hex content hash; same text → same id (dedup, idempotent writes). */
  id: string;
  /** Project-relative path for the retrieval marker (e.g. `.cortex-cache/ab12….txt`). */
  path: string;
}

export function cacheOriginal(text: string, baseDir: string = process.cwd()): Cached | null {
  try {
    const id = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const dir = join(baseDir, CACHE_DIR);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const abs = join(dir, `${id}.txt`);
    if (!existsSync(abs)) writeFileSync(abs, text, 'utf8');
    return { id, path: `${CACHE_DIR}/${id}.txt` };
  } catch {
    return null;
  }
}
