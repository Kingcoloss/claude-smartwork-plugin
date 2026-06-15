/**
 * Runtime expression-mode flag (Sprint 3 / S3-T4).
 *
 * Config gives the DEFAULT terse mode; this flag is the per-session RUNTIME
 * override a user sets with `/cortex …`. It must persist between the two hooks
 * (UserPromptSubmit writes it, SessionStart + UserPromptSubmit read it), so it
 * lives as a tiny file in the Claude config dir. Whitelist-validated on read so
 * a clobbered flag can never inject arbitrary bytes into context.
 *
 * Best-effort like everything in cortex: any fs error → treated as "no override".
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { configDir } from './config.ts';
import type { CortexConfig } from './config.ts';
import type { ExprMode } from './expression.ts';

export type ExprOverride = 'off' | ExprMode;
const VALID = new Set<string>(['off', 'lite', 'full', 'ultra']);

function flagPath(): string {
  return join(configDir(), '.cortex-expression');
}

/** The current override, or null if unset/invalid (→ fall back to config). */
export function readExprOverride(): ExprOverride | null {
  try {
    const v = readFileSync(flagPath(), 'utf8').trim();
    return VALID.has(v) ? (v as ExprOverride) : null;
  } catch {
    return null;
  }
}

/** Persist an override; returns false on any fs failure (caller stays a no-op). */
export function writeExprOverride(v: ExprOverride): boolean {
  try {
    const p = flagPath();
    if (!existsSync(dirname(p))) mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, v, { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

/** Remove any override (→ back to config default). */
export function clearExprOverride(): boolean {
  try {
    unlinkSync(flagPath());
    return true;
  } catch {
    return false;
  }
}

/** Resolve effective expression state: runtime override wins over config. */
export function resolveExpression(cfg: CortexConfig): { enabled: boolean; mode: ExprMode } {
  const o = readExprOverride();
  if (o === 'off') return { enabled: false, mode: cfg.expression.mode };
  if (o) return { enabled: true, mode: o }; // explicit on at a chosen level
  return { enabled: cfg.expression.enabled, mode: cfg.expression.mode };
}
