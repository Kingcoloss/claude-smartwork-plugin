#!/usr/bin/env bun
/**
 * SessionStart hook for the Expression faculty (Sprint 3 / S3-T4).
 *
 * Emits the standing terse-style ruleset. A SessionStart hook's stdout is
 * injected as session context (invisible to the user), so writing the ruleset
 * to stdout is exactly how we steer every later response toward fewer tokens.
 * The per-turn UserPromptSubmit hook then narrows it to the prompt's language.
 *
 * Cooperate-not-replace: anything off (global or expression) → no output.
 */
import { getConfig } from '../lib/config.ts';
import { standingRuleset } from '../lib/expression.ts';
import { resolveExpression } from '../lib/exprmode.ts';
import { debug } from '../lib/log.ts';

async function main(): Promise<void> {
  try {
    await Bun.stdin.text(); // drain stdin so we never block the pipe
  } catch {}

  const cfg = getConfig();
  if (!cfg.enabled) return;
  const { enabled, mode } = resolveExpression(cfg);
  if (!enabled) return;

  process.stdout.write(standingRuleset(mode, cfg.expression.lang));
}

main().catch((err) => debug('expression', 'sessionstart', (err as Error)?.message));
