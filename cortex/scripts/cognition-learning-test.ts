/**
 * Efficient-Learning rubric deterministic GATE (Sprint 5 / S5-T3).
 * Asserts the domain-agnostic lesson-extraction rubric (the Cognition faculty's contribution
 * to Memory consolidation) and that the SessionEnd distiller prompt actually folds it in.
 * Pure — no ollama / no network.
 *
 * Run:  bun run cortex/scripts/cognition-learning-test.ts
 */
import { LESSON_RUBRIC, lessonRubric } from '../lib/cognition.ts';
import { buildPrompt } from '../lib/consolidate.ts';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// ── 1. the rubric items — well-formed and distinct ───────────────────────────
ok(LESSON_RUBRIC.length === 4, 'exactly four rubric items', String(LESSON_RUBRIC.length));
ok(LESSON_RUBRIC.every((r) => r.trim().length > 0), 'every rubric item is non-empty');
ok(new Set(LESSON_RUBRIC).size === 4, 'all four rubric items are distinct');

// ── 2. the rendered rubric — covers every item, ties to the อริยสัจ4 lesson shape ─
const r = lessonRubric();
ok(LESSON_RUBRIC.every((item) => r.includes(item)), 'rendered rubric carries every item');
ok(/generalize/i.test(r), 'rubric demands a generalizable lesson (transfers to a different situation)');
ok(/samudaya/i.test(r) && /magga/i.test(r), 'rubric names the อริยสัจ4 cause/fix fields it feeds');
ok(/root/i.test(r) && /symptom/i.test(r), 'rubric demands root-cause over symptom (Yoniso/Pahāna)');

// ── 3. domain-agnostic — the same requirement the disciplines/hindrances carry ─
const CODING_ONLY = ['code', 'compile', 'function', 'variable', 'repo', 'commit', 'refactor', 'debug', 'deploy', 'merge'];
const lower = r.toLowerCase();
const leaked = CODING_ONLY.filter((w) => lower.includes(w));
ok(leaked.length === 0, 'rubric contains no coding-only vocabulary (domain-agnostic)', leaked.join(',') || 'clean');

// ── 4. token-frugal ──────────────────────────────────────────────────────────
ok(r.length < 700, 'rendered rubric is token-frugal (< 700 chars)', `${r.length} chars`);

// ── 5. wired — the consolidation prompt actually embeds the rubric ───────────
const sys = buildPrompt('User: hit a problem\nAssistant: fixed it').find((m) => m.role === 'system');
const sysText = typeof sys?.content === 'string' ? sys.content : '';
ok(sysText.includes(r), 'consolidation system prompt folds in the efficient-learning rubric');
ok(/efficient-learning rubric/i.test(sysText), 'prompt names the rubric so the distiller applies it');

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
