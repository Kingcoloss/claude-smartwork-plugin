#!/usr/bin/env bun
/**
 * UserPromptSubmit hook for the Expression faculty (Sprint 3 / S3-T4).
 *
 * Three jobs, in order:
 *   1. Control — a `/cortex …` prompt sets the runtime mode flag, then stops
 *      (the prompt itself is the user's command, no reinforcement needed).
 *   2. Auto-clarity — if the user is confused or pasted a destructive command,
 *      emit nothing this turn so the answer comes back in clear, normal prose.
 *   3. Reinforce — otherwise emit a short anchor in the prompt's language via
 *      `hookSpecificOutput.additionalContext`, so terse style survives other
 *      plugins' mid-session context injections.
 *
 * Cooperate-not-replace: malformed input or anything off → silent no-op.
 */
import { getConfig } from '../lib/config.ts';
import { detectLang, needsClarity, reinforce } from '../lib/expression.ts';
import { clearExprOverride, resolveExpression, writeExprOverride } from '../lib/exprmode.ts';
import { debug } from '../lib/log.ts';

/** Apply a `/cortex …` control command. Returns true if the prompt was one. */
function handleControl(prompt: string): boolean {
  const m = /^\s*\/cortex(?:\s+(\w+))?\b/i.exec(prompt);
  if (!m) return false;
  const arg = (m[1] || '').toLowerCase();
  if (arg === 'off' || arg === 'stop') return writeExprOverride('off'), true;
  if (arg === 'lite' || arg === 'full' || arg === 'ultra') return writeExprOverride(arg), true;
  if (arg === '' || arg === 'on') return clearExprOverride(), true; // back to config default
  return false; // e.g. `/cortex status` → leave for the control skill
}

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();
  let payload: { prompt?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';

  if (handleControl(prompt)) return;

  const cfg = getConfig();
  if (!cfg.enabled) return;
  const { enabled, mode } = resolveExpression(cfg);
  if (!enabled) return;

  if (needsClarity(prompt)) {
    debug('expression', 'auto-clarity', 'normal prose this turn');
    return;
  }

  const lang = cfg.expression.lang === 'auto' ? detectLang(prompt) : cfg.expression.lang;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: reinforce(lang, mode) },
    }),
  );
}

main().catch((err) => debug('expression', 'userpromptsubmit', (err as Error)?.message));
