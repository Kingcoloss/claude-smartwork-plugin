#!/usr/bin/env bun
/**
 * SessionStart hook for the Memory faculty — injects the memory-capture policy once per session.
 *
 * Ships the "capture decisions to cortex + read cortex on recall" behaviour WITH the plugin (the
 * same SessionStart-stdout mechanism the cognition primer uses), so every install gets it without
 * a per-user CLAUDE.md edit. Token-aware by being once-per-session, not per-prompt.
 *
 * Cooperate-not-replace: cortex/memory off, or `memory.captureDecisions` (CORTEX_CAPTURE_DECISIONS=0)
 * disabled → no output.
 */
import { getConfig } from '../lib/config.ts';
import { memoryPolicy } from '../lib/memory-policy.ts';
import { debug } from '../lib/log.ts';

async function main(): Promise<void> {
  try {
    await Bun.stdin.text(); // drain stdin so we never block the pipe
  } catch {}

  const cfg = getConfig();
  if (!cfg.enabled || !cfg.memory.enabled || !cfg.memory.captureDecisions) return;

  process.stdout.write(memoryPolicy());
}

main().catch((err) => debug('memory', 'sessionstart', (err as Error)?.message));
