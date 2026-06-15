/**
 * Perception — read-side token optimizer (Sprint 2).
 *
 * A PostToolUse hook can REPLACE the tool result Claude reads, via
 * `hookSpecificOutput.updatedToolOutput`. Verified on Claude Code 2.1.177:
 * the replacement value must MATCH the tool's native `tool_response` SHAPE,
 * not a bare string — a Bash response is `{stdout, stderr, ...}`, so we swap
 * only its text field and keep the rest. A bare string is silently ignored.
 *
 * This module is pure (no I/O): it inspects a `tool_response`, locates the big
 * text field, and rebuilds the response with replacement text. The hook entry
 * (`hooks/perception-posttooluse.ts`) handles stdin/stdout and decides to act.
 *
 * Cooperate-not-replace: unknown tools and small outputs are left untouched.
 */
import type { CortexConfig } from './config.ts';

/** Per-tool adapter: locate the compressible text field and rebuild the response. */
interface ToolAdapter {
  /** The big text from a `tool_response`, or null if this response has none. */
  extract(resp: Record<string, unknown>): string | null;
  /** A `tool_response` clone with the text field replaced (other keys preserved). */
  rebuild(resp: Record<string, unknown>, text: string): unknown;
}

/**
 * Known tool_response shapes (each verified live by capturing real payloads,
 * not guessed). Unmapped tools → no-op. The big text field differs per tool:
 *   Bash: { stdout, stderr, interrupted, isImage, noOutputExpected }   → stdout
 *   Read: { type, file: { filePath, content, numLines, ... } }          → file.content
 *   Grep: { mode, numFiles, filenames, content, numLines }              → content (mode "content")
 * Glob is intentionally NOT mapped: its payload is a path array, which would
 * violate the "never drop a path" guardrail and barely saves tokens.
 */
const ADAPTERS: Record<string, ToolAdapter> = {
  Bash: {
    extract: (r) => (typeof r.stdout === 'string' ? r.stdout : null),
    rebuild: (r, text) => ({ ...r, stdout: text }),
  },
  Read: {
    extract: (r) => {
      const f = r.file as Record<string, unknown> | undefined;
      return r.type === 'text' && f && typeof f.content === 'string' ? f.content : null;
    },
    rebuild: (r, text) => ({ ...r, file: { ...(r.file as object), content: text } }),
  },
  Grep: {
    extract: (r) =>
      r.mode === 'content' && typeof r.content === 'string' && r.content.length > 0 ? r.content : null,
    rebuild: (r, text) => ({ ...r, content: text }),
  },
};

export interface Perceived {
  tool: string;
  text: string;
  chars: number;
  /** Rebuild the original tool_response with `text` swapped in (for updatedToolOutput). */
  rebuild: (text: string) => unknown;
}

/** Inspect a tool_response; return its compressible payload, or null to skip. */
export function perceive(toolName: unknown, toolResponse: unknown): Perceived | null {
  const adapter = typeof toolName === 'string' ? ADAPTERS[toolName] : undefined;
  if (!adapter || toolResponse == null || typeof toolResponse !== 'object') return null;
  const resp = toolResponse as Record<string, unknown>;
  const text = adapter.extract(resp);
  if (text == null) return null;
  return {
    tool: toolName as string,
    text,
    chars: text.length,
    rebuild: (t) => adapter.rebuild(resp, t),
  };
}

/** Only act on outputs big enough to matter (and only while perception is on). */
export function overThreshold(chars: number, cfg: CortexConfig): boolean {
  return cfg.perception.enabled && chars >= cfg.perception.thresholdChars;
}
