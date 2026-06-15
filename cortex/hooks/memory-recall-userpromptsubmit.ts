#!/usr/bin/env bun
/**
 * UserPromptSubmit hook for the Memory faculty — recall relevant memory (S4-T5).
 *
 * The user's prompt IS the query. We recall the most relevant Core Memory lessons
 * (the อริยสัจ4 anti-repeat ledger) and LLM-Wiki concept pages, then inject them via
 * `hookSpecificOutput.additionalContext`. This is the first hook that makes the
 * Memory store actually run in the lifecycle — T1–T4 built the store; this reads it.
 *
 * Sati-Sampajañña (freshness): every item carries its age and the block is fenced
 * with a "may be stale — verify against current state" caveat (see formatRecall), so
 * recall informs the turn without overriding what's true right now.
 *
 * Best-effort: memory disabled, no DB, a `/cortex` control prompt, an empty prompt,
 * or no relevant hits → silent no-op (no context emitted), so a normal turn proceeds
 * untouched (cooperate, not replace).
 */
import { getConfig } from '../lib/config.ts';
import { openMemory, closeMemory, recallCore, recallWiki, formatRecall } from '../lib/memory.ts';
import { debug } from '../lib/log.ts';

const LIMIT = 3; // top-K per store — kept tight: this injects on EVERY prompt

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();
  let payload: { prompt?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
  if (!prompt || prompt.startsWith('/cortex')) return; // nothing to recall / a control command

  const cfg = getConfig();
  if (!cfg.enabled || !cfg.memory.enabled) return;

  const h = openMemory({ cfg });
  if (!h) return;
  try {
    const [core, wiki] = await Promise.all([
      recallCore(h, prompt, { limit: LIMIT }),
      recallWiki(h, prompt, { limit: LIMIT }),
    ]);
    const block = formatRecall(core, wiki, Date.now());
    if (!block) {
      debug('memory', 'recall', 'no relevant memory → no-op');
      return;
    }
    debug('memory', 'recall', `injected ${core.length} lessons + ${wiki.length} pages`);
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: block },
      }),
    );
  } finally {
    closeMemory(h);
  }
}

main().catch((err) => debug('memory', 'recall fatal', (err as Error)?.message));
