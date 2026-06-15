/**
 * Cognition disciplines deterministic GATE (Sprint 5 / S5-T1).
 * Asserts the eight domain-agnostic disciplines and the rendered injectable block — pure,
 * no ollama / no network. The domain-agnostic requirement (NOT coding-specific) is enforced
 * here: the block must carry no coding-only vocabulary.
 *
 * Run:  bun run cortex/scripts/cognition-discipline-test.ts
 */
import { DISCIPLINES, disciplineBlock } from '../lib/cognition.ts';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// ── 1. the eight disciplines, well-formed and distinct ───────────────────────
ok(DISCIPLINES.length === 8, 'exactly eight disciplines', String(DISCIPLINES.length));
ok(DISCIPLINES.every((d) => d.name.trim() && d.pali.trim() && d.line.trim()), 'every discipline has name + pali + line');
ok(new Set(DISCIPLINES.map((d) => d.pali)).size === 8, 'all eight Pali tags are distinct');

// ── 2. the rendered block — header, framing, full coverage ───────────────────
const block = disciplineBlock();
ok(block.includes('⟦cortex cognition'), 'block carries the cortex cognition header');
ok(/does not override/i.test(block), 'block states cooperate-not-replace (informs, does not override)');
ok(/any task/i.test(block), 'block frames itself as domain-agnostic ("any task")');
ok(DISCIPLINES.every((d) => block.includes(d.pali)), 'block renders every Pali tag');
ok(DISCIPLINES.every((d) => block.includes(d.name)), 'block renders every discipline name');
ok(DISCIPLINES.every((d) => block.includes(d.line)), 'block renders every imperative line');

// ── 3. domain-agnostic — the explicit S5-T1 requirement (NOT coding-specific) ─
const CODING_ONLY = ['code', 'compile', 'function', 'variable', 'repo', 'commit', 'refactor', 'debug', 'deploy', 'merge'];
const lower = block.toLowerCase();
const leaked = CODING_ONLY.filter((w) => lower.includes(w));
ok(leaked.length === 0, 'block contains no coding-only vocabulary (domain-agnostic)', leaked.join(',') || 'clean');

// ── 4. token-aware — a standing block must stay small ────────────────────────
ok(block.length < 1200, 'rendered block is token-frugal (< 1200 chars)', `${block.length} chars`);
const renderedLines = block.trim().split('\n').slice(1); // drop header
ok(renderedLines.every((l) => l.length < 160), 'each discipline line stays terse (< 160 chars)');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
