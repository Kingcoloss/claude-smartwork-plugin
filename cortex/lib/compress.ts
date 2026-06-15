/**
 * Compression engine (Sprint 2 / S2-T3).
 *
 * Sends an over-threshold tool output to ollama with a per-content-type prompt,
 * then gates the result behind a technical-accuracy guardrail before letting it
 * replace what Claude reads. The guardrail is the real safety net: it extracts
 * the high-risk-to-lose tokens from the ORIGINAL (URLs, absolute paths, hashes,
 * multi-digit numbers) and rejects any compression that dropped one — we prefer
 * a no-op over silently losing a path or an error code.
 *
 * Cooperate-not-replace: any failure (ollama down/slow, empty reply, guardrail
 * miss) returns null, and the caller leaves the original output untouched.
 */
import { chat, type ChatMessage } from './ollama.ts';
import type { CortexConfig } from './config.ts';
import type { ContentKind } from './router.ts';

/** Fallback sync cap if config omits one; chat()'s 60s default is far too long for a hook. */
const HOOK_TIMEOUT_MS = 15_000;

const SHARED_RULES =
  'Preserve EVERY identifier, file path, URL, number, error code, status, and quoted ' +
  'literal EXACTLY as written. Never invent facts. Output ONLY the condensed result with ' +
  'no preamble or commentary. If you cannot shorten it safely, output it unchanged.';

const PROMPTS: Record<ContentKind, string> = {
  json: `You condense JSON tool output for an engineer. Produce a compact digest: list each key path with its value type, keep scalar values that are identifiers/numbers/paths/URLs/status, and collapse long homogeneous arrays to "[<n> items: <first sample>]". ${SHARED_RULES}`,
  code: `You condense source code or structured CLI output for an engineer. Keep all signatures, symbols, paths, and line numbers; remove only redundant blank lines and obvious boilerplate. ${SHARED_RULES}`,
  prose: `You condense prose or log output for an engineer. Keep all facts, names, numbers, paths, and error messages in their original order; remove redundancy and filler. ${SHARED_RULES}`,
};

/** Tokens that must survive compression verbatim: URLs, abs paths, hashes, multi-digit numbers. */
const CRITICAL = /https?:\/\/\S+|\/[\w.\-/]*\w|\b[0-9a-fA-F]{7,}\b|\b\d{3,}\b/g;

export function criticalTokens(text: string): string[] {
  return Array.from(new Set(text.match(CRITICAL) ?? []));
}

/** True if every critical token from the original still appears in the compressed text. */
export function preservesCritical(original: string, compressed: string): boolean {
  for (const tok of criticalTokens(original)) {
    if (!compressed.includes(tok)) return false;
  }
  return true;
}

/** Injection seam for tests; defaults to the real ollama chat. */
export type ChatFn = typeof chat;

export async function compress(
  text: string,
  kind: ContentKind,
  cfg: CortexConfig,
  opts: { chatFn?: ChatFn } = {},
): Promise<string | null> {
  const chatFn = opts.chatFn ?? chat;
  const messages: ChatMessage[] = [
    { role: 'system', content: PROMPTS[kind] },
    { role: 'user', content: text },
  ];
  const timeoutMs = cfg.perception.timeoutMs ?? HOOK_TIMEOUT_MS;
  const out = await chatFn(messages, { cfg, timeoutMs, options: { temperature: 0 } });
  const cleaned = out?.trim();
  if (!cleaned) return null; // ollama down/slow/empty → no-op
  if (!preservesCritical(text, cleaned)) return null; // guardrail tripped → no-op
  return cleaned;
}
