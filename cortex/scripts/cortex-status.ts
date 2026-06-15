#!/usr/bin/env bun
/**
 * `/cortex status` readout (Sprint 3 / S3-T6).
 *
 * Run on demand by the cortex control skill (NOT a hook), so its stdout is meant
 * to be read. Prints a compact, language-neutral snapshot of cortex's effective
 * state — expression mode and where it came from (runtime override vs config),
 * perception threshold + cumulative savings, and the other faculties' on/off —
 * which the model then relays in the user's language.
 */
import { getConfig } from '../lib/config.ts';
import { readExprOverride, resolveExpression } from '../lib/exprmode.ts';
import { readStats } from '../lib/stats.ts';

const cfg = getConfig();
const override = readExprOverride();
const expr = resolveExpression(cfg);
const s = readStats();

const exprSource = override === null ? 'config default' : `runtime override (/cortex ${override})`;
const exprLine = expr.enabled ? `on (${expr.mode}) · lang ${cfg.expression.lang}` : 'off';
const approxTokens = Math.round(s.savedChars / 4); // rough: ~4 chars per token

const lines = [
  'cortex status',
  `  global:      ${cfg.enabled ? 'on' : 'off'}`,
  `  expression:  ${exprLine} · ${exprSource}`,
  `  perception:  ${cfg.perception.enabled ? 'on' : 'off'} · threshold ${cfg.perception.thresholdChars}c · timeout ${cfg.perception.timeoutMs}ms`,
  `  savings:     ${s.savedChars} chars (~${approxTokens} tokens) over ${s.compressions} compression(s)`,
  `  cognition:   ${cfg.cognition.enabled ? 'on' : 'off'} (sub-agent handoff)`,
  `  memory:      ${cfg.memory.enabled ? 'on' : 'off'}`,
];
process.stdout.write(lines.join('\n') + '\n');
