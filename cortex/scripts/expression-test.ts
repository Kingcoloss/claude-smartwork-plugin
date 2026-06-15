/**
 * Sprint 3 (Expression) deterministic GATE — asserts pure logic and the two
 * hooks end-to-end, exiting non-zero on any failure. No network, no model: the
 * hooks are spawned with an isolated CLAUDE_CONFIG_DIR so the runtime mode flag
 * never touches the real ~/.claude.
 *
 * Run:  bun run cortex/scripts/expression-test.ts
 */
import {
  detectLang,
  needsClarity,
  ruleset,
  standingRuleset,
  reinforce,
} from '../lib/expression.ts';
import { writeExprOverride, readExprOverride, clearExprOverride, resolveExpression } from '../lib/exprmode.ts';
import { getConfig } from '../lib/config.ts';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// ── 1. Language detection ────────────────────────────────────────────────────
ok(detectLang('fix the auth bug') === 'en', 'detect English');
ok(detectLang('ช่วยดู bug ใน auth หน่อย') === 'th', 'detect Thai (mixed EN+TH → th)');
ok(detectLang('useMemo re-render') === 'en', 'detect English with code terms');

// ── 2. Auto-clarity (user-side off-switch) ───────────────────────────────────
ok(needsClarity('what do you mean? say again') === true, 'clarity: EN confusion');
ok(needsClarity('งง อธิบายใหม่หน่อย') === true, 'clarity: TH confusion');
ok(needsClarity('please run rm -rf /var/tmp/cache') === true, 'clarity: destructive command');
ok(needsClarity('add a test for the parser') === false, 'no clarity on a normal request');

// ── 3. Rulesets per language + mode ──────────────────────────────────────────
ok(/lite/.test(ruleset('en', 'lite')) && /articles/.test(ruleset('en', 'lite')), 'EN lite keeps articles');
ok(/drop articles/i.test(ruleset('en', 'full')), 'EN full drops articles');
ok(/ultra/.test(ruleset('en', 'ultra')) && /→/.test(ruleset('en', 'ultra')), 'EN ultra has causality arrows');
ok(/ครับ/.test(ruleset('th', 'lite')), 'TH lite names polite particles to drop');
ok(ruleset('th', 'ultra') === ruleset('th', 'full'), 'TH ultra folds to full');
ok(/EN —/.test(standingRuleset('full', 'auto')) && /TH —/.test(standingRuleset('full', 'auto')), 'auto standing rule carries both languages');
ok(standingRuleset('full', 'th') === ruleset('th', 'full'), 'fixed-lang standing rule = that ruleset');
ok(/กระชับ/.test(reinforce('th', 'full')) && /terse/.test(reinforce('en', 'lite')), 'reinforce anchors per language');

// ── 4. Runtime override flag (isolated config dir) ───────────────────────────
const cfgDir = mkdtempSync(join(tmpdir(), 'cortex-expr-'));
process.env.CLAUDE_CONFIG_DIR = cfgDir;
const cfg = getConfig({ fresh: true });
ok(resolveExpression(cfg).enabled === cfg.expression.enabled && readExprOverride() === null, 'no flag → config default');
ok(writeExprOverride('off') && readExprOverride() === 'off', 'write/read off override');
ok(resolveExpression(cfg).enabled === false, 'off override disables');
ok(writeExprOverride('ultra') && resolveExpression(cfg).mode === 'ultra' && resolveExpression(cfg).enabled === true, 'mode override wins + enables');
ok(clearExprOverride() && readExprOverride() === null, 'clear override → back to default');

// ── 5. Hooks end-to-end (spawned with isolated config dir) ───────────────────
const dir = import.meta.dir;
const ssPath = join(dir, '..', 'hooks', 'expression-sessionstart.ts');
const upsPath = join(dir, '..', 'hooks', 'expression-userpromptsubmit.ts');

async function run(path: string, stdin: string, env: Record<string, string>): Promise<string> {
  const proc = Bun.spawn(['bun', path], {
    cwd: cfgDir,
    env: { ...process.env, ...env },
    stdin: new TextEncoder().encode(stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

const runDir = mkdtempSync(join(tmpdir(), 'cortex-expr-run-'));
const baseEnv = { CLAUDE_CONFIG_DIR: runDir, CORTEX_EXPRESS_MODE: 'full', CORTEX_EXPRESS_LANG: 'auto' };

// SessionStart: stdout is the standing ruleset (auto → both languages)
const ss = await run(ssPath, '{"source":"startup"}', baseEnv);
ok(/EN —/.test(ss) && /TH —/.test(ss), 'SessionStart injects the auto standing ruleset');

// SessionStart with a fixed language emits just that ruleset
const ssTh = await run(ssPath, '{"source":"startup"}', { ...baseEnv, CORTEX_EXPRESS_LANG: 'th' });
ok(ssTh.trim() === ruleset('th', 'full'), 'SessionStart (th) emits the Thai ruleset');

// UserPromptSubmit: Thai prompt → Thai reinforcement via additionalContext
const upsTh = await run(upsPath, JSON.stringify({ prompt: 'ช่วย refactor function นี้' }), baseEnv);
const upsThJson = JSON.parse(upsTh);
ok(upsThJson?.hookSpecificOutput?.hookEventName === 'UserPromptSubmit', 'UPS emits correct hookEventName');
ok(upsThJson?.hookSpecificOutput?.additionalContext === reinforce('th', 'full'), 'UPS reinforces in Thai for a Thai prompt');

// English prompt → English reinforcement
const upsEn = await run(upsPath, JSON.stringify({ prompt: 'refactor this function' }), baseEnv);
ok(JSON.parse(upsEn)?.hookSpecificOutput?.additionalContext === reinforce('en', 'full'), 'UPS reinforces in English for an English prompt');

// Auto-clarity → no reinforcement this turn
const upsConfused = await run(upsPath, JSON.stringify({ prompt: 'งง อธิบายใหม่' }), baseEnv);
ok(upsConfused.trim() === '', 'UPS stays silent on a confused prompt (auto-clarity)');

// Control: /cortex off writes the flag and disables; then a normal prompt is silent
const upsOff = await run(upsPath, JSON.stringify({ prompt: '/cortex off' }), baseEnv);
ok(upsOff.trim() === '' && existsSync(join(runDir, '.cortex-expression')) && readFileSync(join(runDir, '.cortex-expression'), 'utf8').trim() === 'off', '/cortex off writes the off flag');
const upsAfterOff = await run(upsPath, JSON.stringify({ prompt: 'refactor this function' }), baseEnv);
ok(upsAfterOff.trim() === '', 'after /cortex off, UPS injects nothing');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
