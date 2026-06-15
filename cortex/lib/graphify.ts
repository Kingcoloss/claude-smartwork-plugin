/**
 * graphify integration (Sprint 5 / S5-T7) — nudge coding work toward knowledge-graph discovery
 * instead of raw Grep/Glob/Read. graphify (the repo-mandated source-discovery tool) navigates
 * code structurally and far more cheaply in tokens — exactly cortex's whole point. This is a
 * Cognition-faculty nudge: injected ONLY in a coding context (the UserPromptSubmit hook's
 * isCodingContext gate) AND only when graphify is actually available, so we never recommend a
 * tool the user doesn't have. Cooperate-not-replace: a suggestion, not a block — Grep/Glob/Read
 * stay available when the graph doesn't cover the answer.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from './config.ts';

const NUDGE =
  '⟦cortex discovery — prefer the knowledge graph (this task looks like code)⟧\n' +
  '- use graphify (/graphify) to find code, callers, and impact BEFORE Grep/Glob/Read — ' +
  'structural and far cheaper in tokens. Fall back to file scanning only when the graph misses.';

/** The graphify discovery nudge (pure text). */
export function graphifyNudge(): string {
  return NUDGE;
}

/**
 * Is graphify usable here? True when the project root (`cwd`, which CC hands the hook) holds a
 * built graph, OR the graphify skill is installed for this user. We check `cwd` directly rather
 * than walking up — a parent-dir walk can stray into an unrelated graph (e.g. a stray marker in
 * a shared temp root). Both are filesystem probes (no network) — best-effort, never throws.
 */
export function graphAvailable(cwd: string = process.cwd()): boolean {
  try {
    if (existsSync(join(cwd, '.code-review-graph')) || existsSync(join(cwd, '.graphify'))) return true;
    return existsSync(join(configDir(), 'skills', 'graphify'));
  } catch {
    return false;
  }
}
