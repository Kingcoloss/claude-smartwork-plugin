/**
 * graphify-nudge GATE (Sprint 5 / S5-T7) — prefer KG discovery over Grep, in a coding context.
 * Asserts the nudge content, the graphAvailable() probe (project graph dir OR installed skill,
 * else false), and the real UserPromptSubmit hook: a coding prompt WITH a graph injects the
 * nudge; a coding prompt WITHOUT one injects the coding block but no nudge. No ollama / Claude.
 *
 * Run:  bun run cortex/scripts/cognition-graphify-test.ts
 */
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// Isolate config so the skill-probe is deterministic (no graphify under this temp CONFIG_DIR).
process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cortex-graphify-cfg-'));
const { graphifyNudge, graphAvailable } = await import('../lib/graphify.ts');
const hookPath = join(import.meta.dir, '..', 'hooks', 'cognition-userpromptsubmit.ts');

async function runHook(stdin: unknown, cwd: string): Promise<string> {
  const proc = Bun.spawn(['bun', hookPath], {
    cwd,
    env: { ...process.env, CORTEX_MEMORY_DIR: cwd },
    stdin: new TextEncoder().encode(JSON.stringify(stdin)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

// ── 1. nudge content — graphify, KG-before-Grep, cooperate-not-replace ───────
const n = graphifyNudge();
ok(/graphify/i.test(n), 'nudge names graphify');
ok(/before\s+grep/i.test(n) && /knowledge graph/i.test(n), 'nudge says use the KG before Grep');
ok(/fall back/i.test(n), 'nudge keeps file scanning as a fallback (cooperate-not-replace)');
ok(n.length < 400, 'nudge is token-frugal (< 400 chars)', `${n.length} chars`);

// ── 2. graphAvailable — project graph dir, installed skill, or neither ───────
const noGraph = mkdtempSync(join(tmpdir(), 'cortex-graphify-none-'));
ok(graphAvailable(noGraph) === false, 'no project graph + no installed skill → unavailable');

const withGraph = mkdtempSync(join(tmpdir(), 'cortex-graphify-proj-'));
mkdirSync(join(withGraph, '.code-review-graph'));
ok(graphAvailable(withGraph) === true, 'project .code-review-graph dir → available');

const skillCfg = mkdtempSync(join(tmpdir(), 'cortex-graphify-skill-'));
mkdirSync(join(skillCfg, 'skills', 'graphify'), { recursive: true });
const savedCfg = process.env.CLAUDE_CONFIG_DIR;
process.env.CLAUDE_CONFIG_DIR = skillCfg;
ok(graphAvailable(noGraph) === true, 'installed graphify skill (under CONFIG_DIR) → available');
process.env.CLAUDE_CONFIG_DIR = savedCfg; // restore for the spawned children

// ── 3. hook e2e — nudge fires only on coding context + a real graph ──────────
const coded = await runHook({ prompt: 'refactor the auth module in server.ts', cwd: withGraph }, withGraph);
const codedCtx = (() => { try { return JSON.parse(coded)?.hookSpecificOutput?.additionalContext ?? ''; } catch { return ''; } })();
ok(/⟦cortex coding discipline/.test(codedCtx) && /graphify/i.test(codedCtx), 'coding prompt + graph → injects coding block AND graphify nudge');

const codedNoGraph = await runHook({ prompt: 'refactor the auth module in server.ts', cwd: noGraph }, noGraph);
const noGraphCtx = (() => { try { return JSON.parse(codedNoGraph)?.hookSpecificOutput?.additionalContext ?? ''; } catch { return ''; } })();
ok(/⟦cortex coding discipline/.test(noGraphCtx), 'coding prompt without graph → still injects the coding block');
ok(!/graphify/i.test(noGraphCtx), 'coding prompt without graph → NO graphify nudge');

const prose = await runHook({ prompt: 'write a short story about the desert', cwd: withGraph }, withGraph);
ok(prose.trim() === '', 'non-coding prompt → no nudge even with a graph present');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
