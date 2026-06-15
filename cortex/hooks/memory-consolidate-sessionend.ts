#!/usr/bin/env bun
/**
 * SessionEnd hook for the Memory faculty — consolidate the session (S4-T6).
 *
 * When a session ends, Claude Code hands us the `transcript_path`. We distil it into
 * durable memory (lessons → Core Memory, concepts → LLM-Wiki) and auto-write the
 * `.cortex/handoff.md` the Cognition hook reads. This is the WRITE-side counterpart to
 * the S4-T5 recall hook: recall reads memory in, consolidation writes it back out.
 *
 * SessionEnd (not PreCompact) on purpose: distillation is one LLM call that can be slow
 * on a local model, and SessionEnd blocks nothing the user is waiting on (PreCompact
 * would stall compaction). SessionEnd emits no context, so there's no stdout to write.
 *
 * Cooperate-not-replace: no transcript / memory disabled / down LLM / malformed output
 * → it simply writes less or nothing, never blocks the session from ending.
 */
import { getConfig } from '../lib/config.ts';
import { openMemory, closeMemory } from '../lib/memory.ts';
import { consolidate } from '../lib/consolidate.ts';
import { debug } from '../lib/log.ts';

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();
  let payload: { transcript_path?: unknown; cwd?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const transcriptPath = typeof payload.transcript_path === 'string' ? payload.transcript_path : '';
  if (!transcriptPath) return;

  const cfg = getConfig();
  if (!cfg.enabled || !cfg.memory.enabled) return;

  const h = openMemory({ cfg });
  if (!h) return;
  try {
    const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();
    const r = await consolidate(h, transcriptPath, { cfg, cwd });
    debug('memory', 'consolidate', `lessons=${r.lessons} pages=${r.pages} handoff=${r.handoffWritten}`);
  } finally {
    closeMemory(h);
  }
}

main().catch((err) => debug('memory', 'consolidate fatal', (err as Error)?.message));
