#!/usr/bin/env bun
/**
 * PreToolUse hook for the Cognition faculty — sub-agent delegation handoff.
 *
 * Before a Task/Agent sub-agent spawns, prepend the project handoff to its
 * `prompt` so it inherits scope instead of starting cold. Mechanism (verified
 * via the RTK rewrite hook on this CC version): a PreToolUse hook rewrites the
 * tool input by emitting `hookSpecificOutput.updatedInput` — the full tool_input
 * with only the field we change, here `prompt`.
 *
 * Cooperate-not-replace: not a sub-agent spawn, no handoff file, or any failure
 * → silent no-op, and the original prompt runs untouched.
 */
import { getConfig } from '../lib/config.ts';
import { readHandoff, composeSubagentPrompt } from '../lib/handoff.ts';
import { debug } from '../lib/log.ts';

/** Tool names that spawn a sub-agent (CC uses "Task"; some harnesses surface "Agent"). */
const SUBAGENT_TOOLS = new Set(['Task', 'Agent']);

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();
  let payload: { tool_name?: unknown; tool_input?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const cfg = getConfig();
  if (!cfg.enabled || !cfg.cognition.enabled) return;
  if (typeof payload.tool_name !== 'string' || !SUBAGENT_TOOLS.has(payload.tool_name)) return;

  const input = payload.tool_input;
  if (input == null || typeof input !== 'object') return;
  const rec = input as Record<string, unknown>;
  if (typeof rec.prompt !== 'string' || rec.prompt.length === 0) return;

  const handoff = readHandoff();
  if (!handoff) {
    debug('cognition', payload.tool_name, 'no .cortex/handoff.md → no-op');
    return;
  }

  const updatedInput = { ...rec, prompt: composeSubagentPrompt(handoff, rec.prompt) };
  debug('cognition', payload.tool_name, `injected ${handoff.length}-char handoff into sub-agent prompt`);
  // Emit only updatedInput (no permissionDecision) so we augment the prompt but
  // leave the normal permission flow for spawning sub-agents untouched.
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput,
      },
    }),
  );
}

main().catch((err) => debug('cognition', 'fatal', (err as Error)?.message));
