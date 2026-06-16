#!/usr/bin/env bun
/**
 * `/cortex-recall` readout (Sprint 4 / S4-T7).
 *
 * The ON-DEMAND, user-driven half of recall (the S4-T5 hook is the automatic half):
 * run by the `cortex-recall` skill so its stdout is meant to be read and relayed.
 *
 *   cortex-recall.ts "<query>"   → relevant Core Memory lessons + LLM-Wiki pages
 *   cortex-recall.ts --index     → the full LLM-Wiki catalog (titles · tags · age)
 *
 * Output carries the same freshness caveat as the hook (Sati-Sampajañña): recall is
 * the past, verify against current state. Memory off / no sqlite → a plain note, exit 0
 * (cooperate, not replace). Recall degrades to FTS keyword when ollama/vec is absent.
 */
import { getConfig } from '../lib/config.ts';
import { openMemory, closeMemory, recallCore, recallWiki, listWiki, formatRecall, ago } from '../lib/memory.ts';

const args = process.argv.slice(2);
const tagIdx = args.indexOf('--tag');
const tag = tagIdx >= 0 ? (args[tagIdx + 1] ?? '').trim() : null; // --tag <value> → filter the catalog by tag
const h = openMemory({ cfg: getConfig() });
if (!h) {
  process.stdout.write('cortex memory: unavailable (disabled or no sqlite)\n');
  process.exit(0);
}

/** Does a page carry `tag` as a whole, comma-separated tag (case-insensitive)? */
const hasTag = (tags: string | null | undefined, want: string): boolean =>
  (tags ?? '').split(',').map((s) => s.trim().toLowerCase()).includes(want.toLowerCase());

try {
  if (args.includes('--index') || tag) {
    let pages = listWiki(h, 100);
    if (tag) { const t = tag; pages = pages.filter((p) => hasTag(p.tags, t)); }
    const label = tag ? `cortex LLM-Wiki — tag "${tag}"` : 'cortex LLM-Wiki';
    if (pages.length === 0) {
      process.stdout.write(`${label}: (none)\n`);
    } else {
      const now = Date.now();
      const lines = [`${label} — ${pages.length} page(s):`];
      for (const p of pages) lines.push(`- ${p.title}${p.tags ? `  [${p.tags}]` : ''}  (${ago(now, p.updatedAt)})`);
      process.stdout.write(lines.join('\n') + '\n');
    }
  } else {
    const query = args.filter((a) => !a.startsWith('--')).join(' ').trim();
    if (!query) {
      process.stdout.write('cortex recall: pass a query, or --index for the catalog\n');
      process.exit(0);
    }
    const [core, wiki] = await Promise.all([
      recallCore(h, query, { limit: 5 }),
      recallWiki(h, query, { limit: 5 }),
    ]);
    const block = formatRecall(core, wiki, Date.now());
    process.stdout.write(block ? block + '\n' : `cortex recall: nothing relevant to "${query}"\n`);
  }
} finally {
  closeMemory(h);
}
