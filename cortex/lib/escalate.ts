/**
 * Optional tiered escalation to a full Claude model.
 *
 * The subconscious (ollama) is the default worker; this escalates to Claude
 * (Sonnet/Opus/Haiku, configurable) for jobs where the small local model isn't
 * accurate enough — consolidation, lesson extraction.
 *
 * Transport: the `claude` CLI in headless/print mode (`claude -p --model <m>`),
 * which inherits the SAME auth as the running Claude Code session. A Pro/Max
 * SUBSCRIPTION works with no API key and no token management. This is the D0
 * "cooperate & amplify native Claude Code" path — the escalation IS Claude Code,
 * invoked one-shot. The CLI also resolves ANTHROPIC_API_KEY if that's how the
 * user is logged in, so this works in both subscription and key setups.
 *
 * Opt-in (escalation.enabled). Cooperate-not-replace contract: returns null on
 * any failure (claude not on PATH, non-zero exit, timeout), never throws.
 */
import type { CortexConfig } from './config.ts';
import { getConfig } from './config.ts';
import { debug } from './log.ts';
import type { ChatMessage } from './ollama.ts';

const TIMEOUT_MS = 120_000;

/** True when the escalation tier is enabled. Actual reachability of the CLI is
 *  proven only by a call (which degrades to null if `claude` is absent). */
export function escalationAvailable(cfg: CortexConfig = getConfig()): boolean {
  return cfg.enabled && cfg.escalation.enabled;
}

/** `claude -p` is single-prompt (no role array): fold the turns into one block. */
function renderPrompt(messages: ChatMessage[]): string {
  return messages
    .map((m) => (m.role === 'assistant' ? `Assistant: ${m.content}` : m.content))
    .join('\n\n');
}

/**
 * Escalate a chat to Claude via the `claude` CLI. Returns the model's text,
 * or null if the tier is off / the CLI is unavailable / the call fails.
 */
export async function escalate(
  messages: ChatMessage[],
  opts: { cfg?: CortexConfig; model?: string; timeoutMs?: number } = {},
): Promise<string | null> {
  const cfg = opts.cfg ?? getConfig();
  if (!escalationAvailable(cfg)) return null;
  const model = opts.model ?? cfg.escalation.model;

  // Prompt goes via stdin (no ARG_MAX / escaping limits on large content).
  // Bun.spawn throws synchronously if `claude` isn't on PATH — degrade to null.
  let proc;
  try {
    proc = Bun.spawn(['claude', '-p', '--model', model], {
      stdin: new TextEncoder().encode(renderPrompt(messages)),
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (err) {
    debug('escalate spawn failed', (err as Error)?.message);
    return null;
  }

  const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) {
      debug('escalate exit', code);
      return null;
    }
    const text = out.trim();
    return text || null;
  } catch (err) {
    debug('escalate error', (err as Error)?.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
