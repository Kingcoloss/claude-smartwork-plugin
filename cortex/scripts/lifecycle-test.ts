/**
 * End-to-end lifecycle wiring + cross-hook conflict GATE (Sprint 6 / S6-T2).
 *
 * cortex wires EIGHT hooks across five lifecycle events; several share an event (two on
 * SessionStart, three on UserPromptSubmit). This gate proves they are (a) wired correctly —
 * every hooks.json command points at a real, guarded file — and (b) CONFLICT-FREE — the hooks
 * that share an event all run, each emits its own independently-valid output, and none crash or
 * clobber another. No ollama / no Claude (memory seeded for FTS recall).
 *
 * Run:  bun run cortex/scripts/lifecycle-test.ts
 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cortex-lifecycle-cfg-'));
const { openMemory, closeMemory, commitCore } = await import('../lib/memory.ts');

const hooksDir = join(import.meta.dir, '..', 'hooks');
const hooksJson = JSON.parse(readFileSync(join(hooksDir, 'hooks.json'), 'utf8'));

/** Pull the hook filenames a hooks.json event group wires, in order. */
function hookFiles(event: string): string[] {
  const groups = hooksJson.hooks?.[event] ?? [];
  const files: string[] = [];
  for (const g of groups) for (const h of g.hooks ?? []) {
    const m = /hooks\/([\w-]+\.ts)/.exec(h.command ?? '');
    if (m) files.push(m[1]);
  }
  return files;
}

function allCommands(): { event: string; command: string }[] {
  const out: { event: string; command: string }[] = [];
  for (const [event, groups] of Object.entries(hooksJson.hooks ?? {})) {
    for (const g of groups as any[]) for (const h of g.hooks ?? []) out.push({ event, command: h.command });
  }
  return out;
}

async function runHook(file: string, stdin: unknown, env: Record<string, string> = {}, cwd?: string): Promise<{ out: string; code: number }> {
  const proc = Bun.spawn(['bun', join(hooksDir, file)], {
    cwd,
    env: { ...process.env, ...env },
    stdin: new TextEncoder().encode(typeof stdin === 'string' ? stdin : JSON.stringify(stdin)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  return { out, code };
}

// ── 1. wiring — every command targets a real, guarded file ───────────────────
const cmds = allCommands();
const hookCmds = cmds.filter((c) => /hooks\/[\w-]+\.ts/.test(c.command));   // the eight faculty hooks
const provision = cmds.filter((c) => /scripts\/ensure-deps\.sh/.test(c.command)); // first-run dep provisioner
ok(cmds.length === 10, 'hooks.json wires ten commands (nine hooks + the dep provisioner)', String(cmds.length));
ok(hookCmds.length === 9, 'nine faculty-hook commands across five events', String(hookCmds.length));
ok(hookCmds.every((c) => existsSync(join(hooksDir, /hooks\/([\w-]+\.ts)/.exec(c.command)![1]))), 'every hook command points at an existing hook file');
ok(provision.length === 1 && existsSync(join(hooksDir, '..', 'scripts', 'ensure-deps.sh')), 'a SessionStart command provisions deps via ensure-deps.sh (first-run -32000 fix)');
ok(cmds.every((c) => /command -v bun/.test(c.command) && /(\|\| true|; true)\s*$/.test(c.command)), 'every command is bun-guarded and best-effort (|| true / ; true)');

// ── 2. event coverage matches the brain model ────────────────────────────────
ok(JSON.stringify(hookFiles('SessionStart')) === JSON.stringify(['expression-sessionstart.ts', 'cognition-sessionstart.ts', 'memory-sessionstart.ts']), 'SessionStart: expression, cognition, memory primes');
ok(JSON.stringify(hookFiles('UserPromptSubmit')) === JSON.stringify(['expression-userpromptsubmit.ts', 'memory-recall-userpromptsubmit.ts', 'cognition-userpromptsubmit.ts']), 'UserPromptSubmit: expression → memory-recall → cognition');
ok(JSON.stringify(hookFiles('PostToolUse')) === JSON.stringify(['perception-posttooluse.ts']), 'PostToolUse: perception');
ok(JSON.stringify(hookFiles('SessionEnd')) === JSON.stringify(['memory-consolidate-sessionend.ts']), 'SessionEnd: memory-consolidate');
ok(JSON.stringify(hookFiles('PreToolUse')) === JSON.stringify(['cognition-pretooluse.ts']), 'PreToolUse: cognition handoff');

// ── 3. SessionStart — the two hooks coexist, each contributes its own context ─
const ssExpr = await runHook('expression-sessionstart.ts', '{}');
const ssCog = await runHook('cognition-sessionstart.ts', '{}');
ok(ssExpr.code === 0 && ssCog.code === 0, 'both SessionStart hooks exit cleanly');
ok(ssExpr.out.trim().length > 0 && ssCog.out.includes('⟦cortex cognition'), 'each SessionStart hook emits its own distinct prime (no clobber)');
ok(!ssExpr.out.includes('⟦cortex cognition'), 'expression prime does not carry cognition content (independent outputs)');

// ── 4. UserPromptSubmit — all three fire on one prompt, none conflict ────────
const memDir = mkdtempSync(join(tmpdir(), 'cortex-lifecycle-mem-'));
const seed = openMemory({ dir: memDir, enableVec: false, embed: async () => null })!;
for (let i = 0; i < 3; i++) await commitCore(seed, { dukkha: 'deadlock on the shared connection lock', magga: 'acquire locks in a fixed global order' });
closeMemory(seed);

const prompt = { prompt: 'fix the recurring deadlock on the shared connection lock in server.ts', cwd: memDir };
const env = { CORTEX_MEMORY_DIR: memDir };
const uExpr = await runHook('expression-userpromptsubmit.ts', prompt, env, memDir);
const uRecall = await runHook('memory-recall-userpromptsubmit.ts', prompt, env, memDir);
const uCog = await runHook('cognition-userpromptsubmit.ts', prompt, env, memDir);

ok([uExpr, uRecall, uCog].every((r) => r.code === 0), 'all three UserPromptSubmit hooks exit cleanly');
const parse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
const ctx = (s: string) => parse(s)?.hookSpecificOutput?.additionalContext ?? '';
ok(parse(uExpr.out)?.hookSpecificOutput?.hookEventName === 'UserPromptSubmit', 'expression emits valid UserPromptSubmit JSON');
ok(/may be STALE/i.test(ctx(uRecall.out)), 'memory-recall injects the freshness-caveated recall');
ok(/⟦cortex coding discipline/.test(ctx(uCog.out)) && /อุทธัจจกุกกุจจะ/.test(ctx(uCog.out)), 'cognition injects coding discipline + the chronic flag together');
// conflict check: each hook owns an independent additionalContext payload — they compose, never overwrite.
ok(ctx(uExpr.out) !== ctx(uRecall.out) && ctx(uRecall.out) !== ctx(uCog.out), 'the three injections are independent payloads (additive, not clobbering)');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
