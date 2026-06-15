/**
 * Minimal debug logger for cortex internals.
 *
 * Writes to STDERR only, gated by the CORTEX_DEBUG env var. Never stdout:
 * hook stdout is injected into Claude's context, so a stray log there would
 * leak into the model's working memory (the opposite of saving tokens).
 */
export function debug(...args: unknown[]): void {
  if (process.env.CORTEX_DEBUG) console.error('[cortex]', ...args);
}
