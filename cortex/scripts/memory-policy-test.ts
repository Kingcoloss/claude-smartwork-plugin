/**
 * Memory-capture policy GATE (Sprint 6 follow-up) — the shipped-with-the-plugin SessionStart
 * instruction that makes decision capture + cortex recall a habit without a per-user CLAUDE.md
 * edit. Asserts the policy content and spawns the real SessionStart hook (no ollama / no Claude).
 *
 * Run:  bun run cortex/scripts/memory-policy-test.ts
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cortex-mempol-cfg-'));
const { memoryPolicy } = await import('../lib/memory-policy.ts');
const hookPath = join(import.meta.dir, '..', 'hooks', 'memory-sessionstart.ts');

async function runHook(env: Record<string, string> = {}): Promise<string> {
  const proc = Bun.spawn(['bun', hookPath], {
    env: { ...process.env, ...env },
    stdin: new TextEncoder().encode('{}'),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

// ── 1. content — the policy carries both halves + the augment-not-replace framing ─
const p = memoryPolicy();
ok(p.includes('⟦cortex memory'), 'policy carries the cortex memory header');
ok(/never replace|augment/i.test(p), 'policy states cooperate-not-replace (augment native, never replace)');
ok(/memory_commit/.test(p) && /\/cortex-remember/.test(p), 'policy names the write path (memory_commit / cortex-remember)');
ok(/decision/i.test(p) && /tags = "decision,<project>"/.test(p), 'policy mandates the decision tag (decision,<project>)');
ok(/why/i.test(p) && /alternatives/i.test(p), 'policy asks for the WHY + alternatives in the body');
ok(/memory_recall/.test(p) && /--tag/.test(p), 'policy names the read path (memory_recall / cortex-recall --tag)');
ok(p.length < 900, 'policy block is token-frugal (< 900 chars)', `${p.length} chars`);

// ── 2. hook e2e — emits when on, silent under either off-switch ───────────────
const on = await runHook();
ok(on.includes('⟦cortex memory'), 'SessionStart hook injects the policy by default (captureDecisions on)');
const off = await runHook({ CORTEX_CAPTURE_DECISIONS: '0' });
ok(off.trim() === '', 'CORTEX_CAPTURE_DECISIONS=0 → no injection (config off-switch)');
const disabled = await runHook({ CORTEX_ENABLED: '0' });
ok(disabled.trim() === '', 'cortex disabled → no injection');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
