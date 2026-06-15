/**
 * Delegation handoff — sub-agent context injection (Cognition faculty).
 *
 * When the main agent delegates to a sub-agent (the Task tool), the sub-agent
 * starts COLD: it re-derives scope the main agent already knows, burning tokens
 * and risking drift. A PreToolUse hook rewrites the Task tool's `prompt` (via
 * `hookSpecificOutput.updatedInput`) to PREPEND a handoff — the project scope the
 * sub-agent should know — so it starts warm.
 *
 * The hook cannot see the conversation, so the handoff comes from a file cortex
 * maintains: `.cortex/handoff.md` in the project (walked up from cwd, like the
 * config search). Missing/empty file → no injection (cooperate, not replace).
 * Pure module (no stdout): the hook owns the tool I/O.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Hard cap so a runaway handoff never bloats every sub-agent prompt. */
const MAX_HANDOFF_CHARS = 8_000;
const HANDOFF_REL = join('.cortex', 'handoff.md');

/** Walk up from `start` for `.cortex/handoff.md`; return its trimmed text or null. */
export function readHandoff(start: string = process.cwd()): string | null {
  let dir = start;
  for (let i = 0; i < 64; i++) {
    const f = join(dir, HANDOFF_REL);
    try {
      if (existsSync(f)) {
        const text = readFileSync(f, 'utf8').trim();
        if (!text) return null;
        return text.length > MAX_HANDOFF_CHARS
          ? text.slice(0, MAX_HANDOFF_CHARS) + '\n…[handoff truncated]'
          : text;
      }
    } catch {
      return null;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Prepend the handoff to a sub-agent prompt, fenced so the sub-agent can tell
 * inherited scope from its own task. Returns the augmented prompt.
 */
export function composeSubagentPrompt(handoff: string, prompt: string): string {
  return (
    '⟦cortex handoff — project scope inherited from the delegating agent; ' +
    'treat as background context, not as your task⟧\n' +
    handoff +
    '\n⟦end handoff — your task follows⟧\n\n' +
    prompt
  );
}
