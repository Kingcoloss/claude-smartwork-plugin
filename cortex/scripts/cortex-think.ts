#!/usr/bin/env bun
/**
 * `/cortex-think` deep-reasoning scaffold (Sprint 5 / S5-T5).
 *
 * The ON-DEMAND half of Cognition (the SessionStart prime + the per-prompt metacognition flag
 * are the automatic halves): focus cortex's full cognition + memory onto ONE problem. For the
 * given problem it assembles, in order:
 *   1. the standing thinking-discipline + นิวรณ์5 watch-list (cognitionPrimer)   — always
 *   2. a chronic-recurrence red-flag, if memory has hit this before (metacognitionFlag)
 *   3. relevant prior lessons + knowledge, freshness-caveated (formatRecall)
 *
 * The disciplines stand on their own with no memory; recall/flag enrich them when the store is
 * on and has something relevant. Memory off / no sqlite / empty → just the scaffold. Best-effort,
 * exit 0 (cooperate, not replace). Recall degrades to FTS keyword when ollama/vec is absent.
 */
import { getConfig } from '../lib/config.ts';
import { cognitionPrimer, metacognitionFlag } from '../lib/cognition.ts';
import { openMemory, closeMemory, recallCore, recallWiki, formatRecall } from '../lib/memory.ts';

const problem = process.argv.slice(2).filter((a) => !a.startsWith('--')).join(' ').trim();
if (!problem) {
  process.stdout.write('cortex think: pass a problem or question to reason through, e.g. cortex-think "why does X keep failing"\n');
  process.exit(0);
}

const out: string[] = [cognitionPrimer().trimEnd()]; // the reasoning scaffold — works with no memory

const h = openMemory({ cfg: getConfig() });
if (h) {
  try {
    const flag = await metacognitionFlag(h, problem); // อุทธัจจกุกกุจจะ if this is a known recurrence
    if (flag) out.push('', flag);
    const [core, wiki] = await Promise.all([
      recallCore(h, problem, { limit: 5 }),
      recallWiki(h, problem, { limit: 5 }),
    ]);
    const recall = formatRecall(core, wiki, Date.now()); // prior lessons + knowledge, caveat'd
    if (recall) out.push('', recall.trimEnd());
  } finally {
    closeMemory(h);
  }
}

process.stdout.write(out.join('\n') + '\n');
