#!/usr/bin/env bun
/**
 * SessionStart hook for the Cognition faculty (Sprint 5 / S5-T4).
 *
 * Emits the standing thinking-discipline + self-observation prime once per session. A
 * SessionStart hook's stdout is injected as session context (invisible to the user), so this
 * is how the disciplines (S5-T1) and the นิวรณ์5 watch-list (S5-T2) steer every later turn.
 * Token-aware by design: injected ONCE here, not re-sent per prompt (the per-prompt cost is
 * reserved for the metacognition red-flag, which only fires on a real chronic recurrence).
 *
 * Cooperate-not-replace: cognition (or cortex) off → no output.
 */
import { getConfig } from '../lib/config.ts';
import { cognitionPrimer } from '../lib/cognition.ts';
import { debug } from '../lib/log.ts';

async function main(): Promise<void> {
  try {
    await Bun.stdin.text(); // drain stdin so we never block the pipe
  } catch {}

  const cfg = getConfig();
  if (!cfg.enabled || !cfg.cognition.enabled) return;

  process.stdout.write(cognitionPrimer());
}

main().catch((err) => debug('cognition', 'sessionstart', (err as Error)?.message));
