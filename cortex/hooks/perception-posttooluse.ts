#!/usr/bin/env bun
/**
 * PostToolUse hook entry for the Perception faculty.
 *
 * Pipeline (S2-T2..T4): detect over-threshold tool output → classify its kind →
 * compress via ollama (guardrailed) → cache the verbatim original → REPLACE what
 * Claude reads via `hookSpecificOutput.updatedToolOutput`, carrying a marker that
 * tells Claude how to recover the original. Replacement is the ONLY thing written
 * to stdout (stdout is injected into Claude's context).
 *
 * Reversibility is gated at every step: we replace only if compression succeeded
 * the guardrail AND the original was cached AND the result is meaningfully
 * smaller. Any miss → silent no-op; never block or mislead native Claude Code.
 */
import { getConfig } from '../lib/config.ts';
import { perceive, overThreshold } from '../lib/perception.ts';
import { classify } from '../lib/router.ts';
import { compress } from '../lib/compress.ts';
import { cacheOriginal } from '../lib/cache.ts';
import { debug } from '../lib/log.ts';

/** Only replace if the compressed result is at most this fraction of the original. */
const MAX_RATIO = 0.9;

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();
  let payload: { tool_name?: unknown; tool_response?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return; // malformed / not our payload → no-op
  }

  const cfg = getConfig();
  if (!cfg.enabled || !cfg.perception.enabled) return;

  const seen = perceive(payload.tool_name, payload.tool_response);
  if (!seen || !overThreshold(seen.chars, cfg)) return;

  const kind = classify(seen.text);
  const compressed = await compress(seen.text, kind, cfg);
  if (!compressed) {
    debug('perception', seen.tool, `${kind}: no usable compression (fail/guardrail) → no-op`);
    return;
  }

  // Stay reversible: only replace once the verbatim original is safely cached.
  const cached = cacheOriginal(seen.text);
  if (!cached) {
    debug('perception', seen.tool, 'cache write failed → no-op (keep original)');
    return;
  }

  const marker = `⟦cortex: ${kind} output compressed from ${seen.chars} chars — verbatim original: cat ${cached.path}⟧`;
  const replacement = `${marker}\n${compressed}`;
  if (replacement.length > seen.chars * MAX_RATIO) {
    debug('perception', seen.tool, `gain too small (${seen.chars}→${replacement.length}) → no-op`);
    return;
  }

  debug('perception', seen.tool, `${kind} ${seen.chars}→${replacement.length} chars (saved ${seen.chars - replacement.length})`);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: seen.rebuild(replacement),
      },
    }),
  );
}

main().catch((err) => debug('perception', 'fatal', (err as Error)?.message));
