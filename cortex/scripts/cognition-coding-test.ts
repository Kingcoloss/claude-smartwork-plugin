/**
 * Coding-discipline GATE (Sprint 5 / S5-T6) — karpathy folded in, gated to coding context.
 * The critical property: a coding-only discipline must NEVER fire on domain-agnostic work
 * (writing / research / planning / trading). Asserts the content, the isCodingContext gate's
 * discrimination, and that the coding block stays OUT of the domain-agnostic primer.
 * Also spawns the real UserPromptSubmit hook (no ollama / no Claude).
 *
 * Run:  bun run cortex/scripts/cognition-coding-test.ts
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cortex-coding-cfg-'));
const { CODING_DISCIPLINES, codingDisciplineBlock, isCodingContext, cognitionPrimer } = await import('../lib/cognition.ts');
const hookPath = join(import.meta.dir, '..', 'hooks', 'cognition-userpromptsubmit.ts');

async function runHook(stdin: unknown, env: Record<string, string> = {}, cwd?: string): Promise<string> {
  const proc = Bun.spawn(['bun', hookPath], {
    cwd,
    env: { ...process.env, ...env },
    stdin: new TextEncoder().encode(JSON.stringify(stdin)),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

// ── 1. content — the four karpathy pillars, well-formed ──────────────────────
ok(CODING_DISCIPLINES.length === 4, 'exactly four coding disciplines (karpathy pillars)', String(CODING_DISCIPLINES.length));
ok(CODING_DISCIPLINES.every((d) => d.name.trim() && d.line.trim()), 'every coding discipline has name + line');
const block = codingDisciplineBlock();
ok(block.includes('⟦cortex coding discipline'), 'block carries the coding-discipline header');
ok(/karpathy/i.test(block), 'block attributes karpathy');
ok(/does not override/i.test(block), 'block states cooperate-not-replace');
ok(CODING_DISCIPLINES.every((d) => block.includes(d.line)), 'block renders every imperative');
ok(/assumption/i.test(block) && /minimum code|simplicity/i.test(block) && /surgical|touch only/i.test(block) && /verifiable|success check/i.test(block), 'block covers think/simplicity/surgical/goal-driven');

// ── 2. the coding block stays OUT of the domain-agnostic primer ──────────────
ok(!cognitionPrimer().includes('⟦cortex coding discipline'), 'cognitionPrimer (domain-agnostic) does NOT carry the coding block');

// ── 3. isCodingContext — fires on real code work ─────────────────────────────
const CODING = [
  'fix the bug in auth.ts',
  'refactor the parser into smaller pieces',
  'why does npm run build keep failing',
  'debug this stack trace',
  'resolve the merge conflict in main.py',
  'write a regex that matches emails',
];
for (const p of CODING) ok(isCodingContext(p), `coding → true: "${p}"`);

// ── 4. isCodingContext — must NOT fire on domain-agnostic work (the core guard) ─
const NOT_CODING = [
  'write a blog post about climate change',
  'research the EV market outlook for 2026',
  'plan a 3-day trip to Kyoto',
  'summarize this report for me',
  "what's a good options trading strategy for high volatility",
  'draft an email to my landlord about the rent',
  '   ',
];
for (const p of NOT_CODING) ok(!isCodingContext(p), `non-coding → false: "${p.trim() || '(blank)'}"`);

// ── 5. hook e2e — coding prompt injects the block (memory-free); else no-op ───
const emptyDir = mkdtempSync(join(tmpdir(), 'cortex-coding-mem-'));
const env = { CORTEX_MEMORY_DIR: emptyDir };
const coded = await runHook({ prompt: 'refactor the auth module in server.ts' }, env, emptyDir);
const parsed = (() => { try { return JSON.parse(coded); } catch { return null; } })();
ok(/⟦cortex coding discipline/.test(parsed?.hookSpecificOutput?.additionalContext ?? ''), 'coding prompt → hook injects the coding discipline (no memory needed)');
const prose = await runHook({ prompt: 'write a short poem about the sea' }, env, emptyDir);
ok(prose.trim() === '', 'non-coding prompt with empty memory → no-op');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
