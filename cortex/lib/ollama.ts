/**
 * Subconscious bridge to ollama — embeddings + chat, local or cloud.
 *
 * Endpoints (same shape for local `OLLAMA_HOST` and cloud `https://ollama.com`):
 *   POST /api/embed  { model, input }      -> { embeddings: number[][] }
 *   POST /api/chat   { model, messages }   -> { message: { content } }
 * Cloud requires a Bearer key (`OLLAMA_API_KEY`); local ignores it.
 *
 * Cooperate-not-replace contract: every export degrades to a safe value
 * (null / false) on ANY failure — missing server, timeout, non-200, bad JSON —
 * and NEVER throws to the caller. A hook that loses ollama must no-op, not
 * block native Claude Code.
 */
import type { CortexConfig } from './config.ts';
import { getConfig } from './config.ts';
import { debug } from './log.ts';

const EMBED_TIMEOUT_MS = 30_000;
const CHAT_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 2_000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function baseUrl(cfg: CortexConfig): string {
  return (cfg.ollama.host || '').replace(/\/+$/, '');
}

function headers(cfg: CortexConfig): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.ollama.apiKey) h['authorization'] = `Bearer ${cfg.ollama.apiKey}`;
  return h;
}

/** POST JSON with a hard timeout. Returns parsed body, or null on any failure. */
async function postJson(
  cfg: CortexConfig,
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl(cfg) + path, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      debug('ollama', path, 'HTTP', res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    debug('ollama', path, 'error', (err as Error)?.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** True if the ollama server answers /api/version within the health timeout. */
export async function health(cfg: CortexConfig = getConfig()): Promise<boolean> {
  if (!cfg.enabled) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(baseUrl(cfg) + '/api/version', {
      headers: headers(cfg),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Embed one or more texts. Returns one vector per input, or null on failure. */
export async function embed(
  input: string | string[],
  opts: { model?: string; cfg?: CortexConfig } = {},
): Promise<number[][] | null> {
  const cfg = opts.cfg ?? getConfig();
  if (!cfg.enabled) return null;
  const model = opts.model ?? cfg.ollama.embedModel;
  const data = await postJson(cfg, '/api/embed', { model, input }, EMBED_TIMEOUT_MS);
  const vectors = (data as { embeddings?: unknown })?.embeddings;
  if (!Array.isArray(vectors) || vectors.length === 0) return null;
  return vectors as number[][];
}

/** Single-shot chat completion (stream:false). Returns assistant text, or null. */
export async function chat(
  messages: ChatMessage[],
  opts: {
    model?: string;
    cfg?: CortexConfig;
    timeoutMs?: number;
    options?: Record<string, unknown>;
  } = {},
): Promise<string | null> {
  const cfg = opts.cfg ?? getConfig();
  if (!cfg.enabled) return null;
  const model = opts.model ?? cfg.ollama.compressModel;
  const data = await postJson(
    cfg,
    '/api/chat',
    { model, messages, stream: false, options: opts.options },
    opts.timeoutMs ?? CHAT_TIMEOUT_MS,
  );
  const content = (data as { message?: { content?: unknown } })?.message?.content;
  return typeof content === 'string' ? content : null;
}
