#!/usr/bin/env bun
/**
 * `/cortex-remember` writer (Sprint 4 / S4-T7).
 *
 * The ON-DEMAND, user-driven half of writing memory (the S4-T6 consolidation hook is
 * the automatic half): run by the `cortex-remember` skill to commit one item the user
 * explicitly wants kept. Two shapes, mirroring the store's two durable layers:
 *
 *   --lesson "<problem>" [--cause ..] [--resolved ..] [--fix ..]   → Core Memory (อริยสัจ4)
 *   --page "<title>" --body "<text>" [--tags a,b]                  → LLM-Wiki page
 *
 * A lesson dedups by signature (a recurrence bumps `hits`); a page upserts by title. Memory
 * off / no sqlite → a plain note, exit 0. Bad usage → usage line, exit 1 (cooperate, not replace).
 */
import { getConfig } from '../lib/config.ts';
import { openMemory, closeMemory, commitCore, commitWiki } from '../lib/memory.ts';

/** Minimal `--key value` parser; a flag with no value (or followed by another --flag) is ''. */
function parseFlags(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = '';
  }
  return out;
}

const f = parseFlags(process.argv.slice(2));
const clean = (s?: string) => (s && s.trim() ? s.trim() : undefined);

const h = openMemory({ cfg: getConfig() });
if (!h) {
  process.stdout.write('cortex memory: unavailable (disabled or no sqlite)\n');
  process.exit(0);
}

try {
  if (clean(f.lesson)) {
    const r = await commitCore(h, { dukkha: f.lesson, samudaya: clean(f.cause), nirodha: clean(f.resolved), magga: clean(f.fix) });
    if (!r) { process.stdout.write('cortex remember: could not write the lesson\n'); process.exit(1); }
    process.stdout.write(`cortex remembered a lesson (${r.deduped ? 'recurrence — hits bumped' : 'new'}): ${f.lesson.trim()}\n`);
  } else if (clean(f.page) && clean(f.body)) {
    const r = await commitWiki(h, { title: f.page, body: f.body, tags: clean(f.tags) });
    if (!r) { process.stdout.write('cortex remember: could not write the page\n'); process.exit(1); }
    process.stdout.write(`cortex remembered a page (${r.updated ? 'updated' : 'new'}): ${f.page.trim()}\n`);
  } else {
    process.stdout.write('usage: --lesson "<problem>" [--cause ..] [--resolved ..] [--fix ..]  |  --page "<title>" --body "<text>" [--tags a,b]\n');
    process.exit(1);
  }
} finally {
  closeMemory(h);
}
