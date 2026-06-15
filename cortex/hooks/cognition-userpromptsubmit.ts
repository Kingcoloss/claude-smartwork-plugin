#!/usr/bin/env bun
/**
 * UserPromptSubmit hook for the Cognition faculty (Sprint 5 / S5-T4) — the metacognition red-flag.
 *
 * The prompt IS the context: run it through metacognitionFlag (S5-T2), which recalls Core Memory
 * and, if a lesson is already CHRONIC (hits ≥ threshold), injects the อุทธัจจกุกกุจจะ "don't loop
 * the same fix" warning via `hookSpecificOutput.additionalContext`. This is the per-prompt half of
 * Cognition (the SessionStart hook injects the standing discipline); it stays token-cheap because it
 * emits nothing unless a real recurrence is detected.
 *
 * Cooperate-not-replace: cognition/memory off, a `/cortex` control prompt, an empty prompt, or
 * nothing chronic → silent no-op.
 */
import { getConfig } from '../lib/config.ts';
import { openMemory, closeMemory } from '../lib/memory.ts';
import { metacognitionFlag } from '../lib/cognition.ts';
import { debug } from '../lib/log.ts';

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();
  let payload: { prompt?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
  if (!prompt.trim() || /^\s*\/cortex\b/i.test(prompt)) return; // control prompt → leave to its hooks

  const cfg = getConfig();
  if (!cfg.enabled || !cfg.cognition.enabled) return;

  const h = openMemory({ cfg });
  if (!h) return; // memory off / no sqlite → nothing to recall against
  try {
    const flag = await metacognitionFlag(h, prompt);
    if (!flag) return;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: flag },
      }),
    );
  } finally {
    closeMemory(h);
  }
}

main().catch((err) => debug('cognition', 'userpromptsubmit', (err as Error)?.message));
