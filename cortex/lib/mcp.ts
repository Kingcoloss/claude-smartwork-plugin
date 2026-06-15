/**
 * MCP tool logic (Sprint 4 / S4-T8) — the PULL half of memory.
 *
 * The T5 recall hook (push, every prompt) and the cortex-recall skill (user-driven) read
 * memory; these are the same reads exposed as MCP *tools* so Claude can pull memory mid-task
 * the moment it decides it needs it. Pure functions over an open `MemoryHandle` (no protocol,
 * no SDK) so they gate deterministically over a seeded temp DB — `mcp/server.ts` is the thin
 * stdio shell that opens/closes the handle and wraps these into tool results.
 *
 * Behaviour mirrors the CLIs exactly (`cortex-recall.ts` / `cortex-remember.ts`) — one source
 * of truth in `lib/memory.ts`; recall carries the SAME Sati-Sampajañña freshness caveat.
 */
import {
  recallCore, recallWiki, listWiki, commitCore, commitWiki, formatRecall, ago,
  type MemoryHandle,
} from './memory.ts';

const clean = (s?: string) => (s && s.trim() ? s.trim() : undefined);

/** memory_recall — Core Memory lessons ∪ LLM-Wiki pages for a query, with the freshness caveat. */
export async function recallTool(h: MemoryHandle, query: string): Promise<string> {
  const q = (query ?? '').trim();
  if (!q) return 'cortex recall: pass a query';
  const [core, wiki] = await Promise.all([
    recallCore(h, q, { limit: 5 }),
    recallWiki(h, q, { limit: 5 }),
  ]);
  return formatRecall(core, wiki, Date.now()) || `cortex recall: nothing relevant to "${q}"`;
}

/** What memory_commit accepts: one lesson (Core Memory) OR one page (LLM-Wiki), discriminated by presence. */
export interface CommitInput {
  lesson?: string; cause?: string; resolved?: string; fix?: string; // Core Memory (อริยสัจ4)
  title?: string; body?: string; tags?: string;                     // LLM-Wiki page
}

/** memory_commit — a lesson (dedup by signature, bumps hits) or a page (upsert by title). */
export async function commitTool(h: MemoryHandle, input: CommitInput): Promise<string> {
  if (clean(input.lesson)) {
    const r = await commitCore(h, {
      dukkha: input.lesson!, samudaya: clean(input.cause), nirodha: clean(input.resolved), magga: clean(input.fix),
    });
    if (!r) return 'cortex remember: could not write the lesson';
    return `cortex remembered a lesson (${r.deduped ? 'recurrence — hits bumped' : 'new'}): ${input.lesson!.trim()}`;
  }
  if (clean(input.title) && clean(input.body)) {
    const r = await commitWiki(h, { title: input.title!, body: input.body!, tags: clean(input.tags) });
    if (!r) return 'cortex remember: could not write the page';
    return `cortex remembered a page (${r.updated ? 'updated' : 'new'}): ${input.title!.trim()}`;
  }
  return 'cortex remember: provide a lesson ("lesson") or a page ("title" + "body")';
}

/** wiki_search — search the LLM-Wiki pages by query, or list the full catalog when no query. */
export async function wikiSearchTool(h: MemoryHandle, query?: string): Promise<string> {
  const q = (query ?? '').trim();
  if (!q) {
    const pages = listWiki(h, 100);
    if (pages.length === 0) return 'cortex LLM-Wiki: (empty)';
    const now = Date.now();
    return [
      `cortex LLM-Wiki — ${pages.length} page(s):`,
      ...pages.map((p) => `- ${p.title}${p.tags ? `  [${p.tags}]` : ''}  (${ago(now, p.updatedAt)})`),
    ].join('\n');
  }
  const wiki = await recallWiki(h, q, { limit: 5 });
  if (wiki.length === 0) return `cortex wiki: nothing relevant to "${q}"`;
  const now = Date.now();
  return [
    `cortex wiki — ${wiki.length} hit(s) for "${q}":`,
    ...wiki.map((w) => `- ${w.title}${w.tags ? `  [${w.tags}]` : ''}  (${ago(now, w.updatedAt)})`),
  ].join('\n');
}
