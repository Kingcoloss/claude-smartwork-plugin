#!/usr/bin/env bun
/**
 * UserPromptSubmit hook for the Cognition faculty — the per-prompt context layer. Assembles up
 * to three pieces and injects them via `hookSpecificOutput.additionalContext`:
 *   1. coding discipline (S5-T6) — karpathy guidelines, ONLY when isCodingContext(prompt) is true
 *      (cortex is domain-agnostic; this must not fire on writing/research/trading). Memory-free.
 *   2. graphify nudge (S5-T7) — prefer KG discovery over Grep, ONLY in a coding context AND when
 *      graphify is actually available for the project/user. Memory-free.
 *   3. metacognition red-flag (S5-T2/T4) — if the prompt recalls a CHRONIC Core Memory lesson
 *      (hits ≥ threshold), the อุทธัจจกุกกุจจะ "don't loop the same fix" warning. Needs memory.
 *
 * Token-cheap: emits nothing unless one of these actually triggers. Cooperate-not-replace:
 * cognition off, a `/cortex` control prompt, or an empty prompt → silent no-op.
 */
import { getConfig } from '../lib/config.ts';
import { openMemory, closeMemory } from '../lib/memory.ts';
import { metacognitionFlag, isCodingContext, codingDisciplineBlock } from '../lib/cognition.ts';
import { graphifyNudge, graphAvailable } from '../lib/graphify.ts';
import { debug } from '../lib/log.ts';

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();
  let payload: { prompt?: unknown; cwd?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
  if (!prompt.trim() || /^\s*\/cortex\b/i.test(prompt)) return; // control prompt → leave to its hooks

  const cfg = getConfig();
  if (!cfg.enabled || !cfg.cognition.enabled) return;

  const parts: string[] = [];

  // 1+2. Coding-context layers (memory-free, gated to code-shaped prompts).
  if (isCodingContext(prompt)) {
    parts.push(codingDisciplineBlock().trimEnd());
    const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();
    if (graphAvailable(cwd)) parts.push(graphifyNudge());
  }

  // 3. Metacognition red-flag (needs the memory store).
  const h = openMemory({ cfg });
  if (h) {
    try {
      const flag = await metacognitionFlag(h, prompt);
      if (flag) parts.push(flag);
    } finally {
      closeMemory(h);
    }
  }

  if (parts.length === 0) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: parts.join('\n\n') },
    }),
  );
}

main().catch((err) => debug('cognition', 'userpromptsubmit', (err as Error)?.message));
