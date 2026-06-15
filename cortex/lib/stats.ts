/**
 * Perception savings store (Sprint 3 / S3-T6).
 *
 * The Perception hook computes how many chars each compression saved but, until
 * now, only logged it. This is the tiny persistent accumulator that survives
 * across turns/sessions so `/cortex status` can report cumulative savings. Like
 * the expression flag (lib/exprmode.ts) it lives as one small file in the Claude
 * config dir, and like everything in cortex it is best-effort: any fs/parse error
 * reads back as zeroes and a failed write is swallowed — stats are never worth
 * breaking the hook for.
 *
 * It records CHARS (the unit the hook measures deterministically — no tokenizer);
 * the status readout presents an approximate token figure. The read-modify-write
 * is not locked: two PostToolUse hooks firing at once could drop one increment,
 * which is harmless for an accounting counter. A later sprint's Memory store (S4)
 * can absorb this; for now a flat JSON file keeps it dependency-free.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { configDir } from './config.ts';

export interface PerceptionStats {
  compressions: number;    // successful tool-output replacements
  originalChars: number;   // total size before compression
  compressedChars: number; // total size after compression
  savedChars: number;      // originalChars - compressedChars
}

function statsPath(): string {
  return join(configDir(), '.cortex-stats.json');
}

/** Coerce one field to a finite, non-negative integer (clobbered file → 0). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/** Current totals, or all-zero if unset/unreadable/clobbered. */
export function readStats(): PerceptionStats {
  try {
    const o = JSON.parse(readFileSync(statsPath(), 'utf8')) as Record<string, unknown>;
    return {
      compressions: num(o.compressions),
      originalChars: num(o.originalChars),
      compressedChars: num(o.compressedChars),
      savedChars: num(o.savedChars),
    };
  } catch {
    return { compressions: 0, originalChars: 0, compressedChars: 0, savedChars: 0 };
  }
}

/**
 * Accumulate one successful compression. Returns false on any fs failure (or if
 * there was no real gain) so the caller stays a no-op.
 */
export function recordCompression(originalChars: number, compressedChars: number): boolean {
  const saved = originalChars - compressedChars;
  if (!(saved > 0)) return false; // only the hook's meaningful-gain path should call us
  try {
    const s = readStats();
    const next: PerceptionStats = {
      compressions: s.compressions + 1,
      originalChars: s.originalChars + originalChars,
      compressedChars: s.compressedChars + compressedChars,
      savedChars: s.savedChars + saved,
    };
    const p = statsPath();
    if (!existsSync(dirname(p))) mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(next), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}
