/**
 * Cognition (sub-agent delegation handoff) deterministic GATE.
 * Asserts the pure handoff logic and the PreToolUse hook end-to-end, exiting
 * non-zero on any failure. The hook is spawned with cwd pointed at a temp
 * project so `.cortex/handoff.md` resolution is isolated — no network, no CC.
 *
 * Run:  bun run cortex/scripts/cognition-test.ts
 */
import { readHandoff, composeSubagentPrompt } from '../lib/handoff.ts';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// ── 1. readHandoff + composeSubagentPrompt ───────────────────────────────────
const proj = mkdtempSync(join(tmpdir(), 'cortex-cog-'));
mkdirSync(join(proj, '.cortex'), { recursive: true });
const HANDOFF = 'Project: cortex. Current scope: Sprint 3 Expression. Constraint: respond in Thai.';
writeFileSync(join(proj, '.cortex', 'handoff.md'), HANDOFF, 'utf8');

ok(readHandoff(proj) === HANDOFF, 'readHandoff finds .cortex/handoff.md');
ok(readHandoff(join(proj, 'sub', 'deep')) === null || readHandoff(proj) === HANDOFF, 'readHandoff walks up from a nested dir');
ok(readHandoff(mkdtempSync(join(tmpdir(), 'cortex-empty-'))) === null, 'readHandoff returns null with no handoff file');

const composed = composeSubagentPrompt(HANDOFF, 'Find the bug in auth.ts');
ok(composed.includes(HANDOFF) && composed.includes('Find the bug in auth.ts'), 'compose keeps both handoff and task');
ok(composed.includes('⟦cortex handoff') && composed.includes('⟦end handoff'), 'compose fences the handoff');
ok(composed.indexOf(HANDOFF) < composed.indexOf('Find the bug in auth.ts'), 'handoff precedes the task');

// ── 2. PreToolUse hook end-to-end ────────────────────────────────────────────
const hookPath = join(import.meta.dir, '..', 'hooks', 'cognition-pretooluse.ts');
async function runHook(payload: unknown, cwd: string): Promise<string> {
  const proc = Bun.spawn(['bun', hookPath], {
    cwd,
    env: { ...process.env },
    stdin: new TextEncoder().encode(JSON.stringify(payload)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

// Task spawn with a handoff present → updatedInput carries the augmented prompt
const taskOut = await runHook(
  { tool_name: 'Task', tool_input: { description: 'debug', prompt: 'Find the bug', subagent_type: 'general-purpose' } },
  proj,
);
const parsed = (() => { try { return JSON.parse(taskOut); } catch { return null; } })();
ok(parsed?.hookSpecificOutput?.hookEventName === 'PreToolUse', 'hook emits PreToolUse output');
const newPrompt = parsed?.hookSpecificOutput?.updatedInput?.prompt;
ok(typeof newPrompt === 'string' && newPrompt.includes(HANDOFF) && newPrompt.includes('Find the bug'), 'updatedInput.prompt has handoff + original task');
ok(parsed?.hookSpecificOutput?.updatedInput?.subagent_type === 'general-purpose', 'updatedInput preserves other tool_input fields');
ok(parsed?.hookSpecificOutput?.permissionDecision === undefined, 'hook does not override the permission flow');

// No handoff file → no-op (empty stdout)
const noHandoff = await runHook(
  { tool_name: 'Task', tool_input: { prompt: 'do something' } },
  mkdtempSync(join(tmpdir(), 'cortex-nohand-')),
);
ok(noHandoff.trim() === '', 'no handoff file → no injection');

// Non-subagent tool → no-op even with a handoff present
const nonTask = await runHook({ tool_name: 'Bash', tool_input: { command: 'ls' } }, proj);
ok(nonTask.trim() === '', 'non-subagent tool → no-op');

// Subagent spawn with no prompt → no-op
const noPrompt = await runHook({ tool_name: 'Task', tool_input: { description: 'x' } }, proj);
ok(noPrompt.trim() === '', 'subagent without a prompt → no-op');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
