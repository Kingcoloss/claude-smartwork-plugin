/**
 * Cognition disciplines (Sprint 5 / S5-T1) — buddhist-method reimplemented as an
 * injectable thinking discipline.
 *
 * Eight DOMAIN-AGNOSTIC cognitive disciplines (NOT coding-specific): they apply equally to
 * coding, writing, research, planning, or trading. Researched from the `dhamma-for-trader`
 * source and banked (see session memory `cortex-dhamma-principles`); here each principle is
 * a terse, actionable imperative — the Pali tag is provenance, the English line is the substance.
 *
 * Unlike Expression's EN/TH rulesets (which shape the USER-FACING output, so they follow the
 * user's language), this shapes CLAUDE's own reasoning — internal context — so it is written in
 * one reasoning language. This module is the CONTENT layer (gated here); S5-T4 wires it into
 * SessionStart (token-aware). Cooperate-not-replace: it informs judgment, never overrides it.
 *
 * S5-T2 adds the อภิธรรม / metacognition layer: HINDRANCES (นิวรณ์5) — a bounded anti-pattern
 * taxonomy to self-observe against — and metacognitionFlag(), the Memory→Cognition link that
 * turns a chronic Core Memory recurrence (S4-T3 `hits`) into a "don't loop the same fix" red-flag.
 */
import { recallCore, type MemoryHandle } from './memory.ts';

export interface Discipline {
  name: string; // short English handle
  pali: string; // the Pali/Thai term (provenance)
  line: string; // the actionable, domain-agnostic imperative
}

/** The eight disciplines, in the order they prime a task (frame → verify → act → finish). */
export const DISCIPLINES: Discipline[] = [
  { name: 'Root cause', pali: 'Yoniso', line: 'trace symptoms to the cause before acting; if the framing is wrong, reframe the problem.' },
  { name: 'Verify', pali: 'Kalāma', line: "a claim isn't true for being remembered, sourced, or authoritative — check it against reality." },
  { name: 'Fresh state', pali: 'Sati', line: 'act on what is there NOW, not stale memory; re-read the current state before relying on it.' },
  { name: 'Non-attachment', pali: 'Anatta', line: 'hold your draft loosely — be willing to discard and redo; an answer is not right for being yours.' },
  { name: 'Root fix', pali: 'Pahāna', line: 'fix the real problem, not a mask or workaround that only hides it.' },
  { name: 'Steadiness', pali: 'Upekkhā', line: "under pressure, hold to the evidence and don't thrash." },
  { name: 'Right-size', pali: 'Majjhimā', line: 'neither over- nor under-build; match the effort to the task and cut duplication.' },
  { name: 'Heedfulness', pali: 'Appamāda', line: "on long multi-step work, track what is done and what remains; don't drift." },
];

const HEADER = '⟦cortex cognition — thinking discipline (any task; informs your judgment, does not override it)⟧';

/**
 * Render the standing thinking-discipline block injected as session context. One terse line per
 * discipline (token-frugal by default — cortex's whole point); S5-T4 owns the token-aware
 * decision of WHEN/whether to inject it.
 */
export function disciplineBlock(): string {
  return [HEADER, ...DISCIPLINES.map((d) => `- ${d.name} (${d.pali}): ${d.line}`)].join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────────────────────
// อภิธรรม / metacognition layer (S5-T2) — observe one's own mind-state.
// Where the disciplines above PRIME good thinking, นิวรณ์5 names the five recurring
// failure-states to CATCH in oneself. สติปัฏฐาน framing: observe the state, don't
// suppress it. Domain-agnostic — these afflict any focused task, not just coding.
// ─────────────────────────────────────────────────────────────────────────────

/** The five hindrances (นิวรณ์5) — each line is the anti-pattern + the self-correction. */
export const HINDRANCES: Discipline[] = [
  { name: 'Distraction', pali: 'Kāmacchanda', line: 'pulled into tangents or shiny side-quests — return to the actual task.' },
  { name: 'Aversion', pali: 'Byāpāda', line: 'forcing or fighting the problem in frustration — step back and work with it, not against it.' },
  { name: 'Shallow effort', pali: 'Thīnamiddha', line: 'coasting on a shallow first answer — go to the depth the task actually needs.' },
  { name: 'Thrashing', pali: 'Uddhacca', line: 'retrying the same failed move or churning without progress — stop and rethink the approach.' },
  { name: 'Doubt', pali: 'Vicikicchā', line: 'stuck in doubt, unable to choose — gather one decisive fact, then act.' },
];

const HINDRANCE_HEADER = '⟦cortex metacognition — watch your own state (นิวรณ์5; observe it, don\'t suppress it)⟧';

/** Render the standing self-observation block (companion to disciplineBlock; S5-T4 injects both). */
export function hindranceBlock(): string {
  return [HINDRANCE_HEADER, ...HINDRANCES.map((d) => `- ${d.name} (${d.pali}): ${d.line}`)].join('\n') + '\n';
}

/** The full standing cognition prime — disciplines + self-observation — injected once at SessionStart (S5-T4). */
export function cognitionPrimer(): string {
  return disciplineBlock() + '\n' + hindranceBlock();
}

/** Default recurrence count at which a Core Memory lesson is "chronic" (1 first, 2 repeat, 3 = a pattern). */
const DEFAULT_MIN_HITS = 3;
const clamp = (s: string, n = 100): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/**
 * Memory→Cognition link — อุทธัจจกุกกุจจะ (thrashing / repeating a known failure).
 *
 * Recall the Core Memory for `context`; if a lesson is already CHRONIC (hits ≥ minHits), raise a
 * red-flag so cortex does not loop a known failure. อริยสัจ4 (S4-T3) STORES the recurrence as a
 * `hits` counter; this is where นิวรณ์5 metacognition WARNS on it. Best-effort + quiet: empty
 * context, nothing chronic, or a down store → '' (the caller no-ops). `minHits` is the tunable
 * sensitivity knob (lower = warns sooner, more noise; higher = only the most chronic).
 */
export async function metacognitionFlag(
  h: MemoryHandle,
  context: string,
  opts: { minHits?: number; limit?: number } = {},
): Promise<string> {
  const ctx = (context ?? '').trim();
  if (!ctx) return '';
  const minHits = opts.minHits ?? DEFAULT_MIN_HITS;
  const recalled = await recallCore(h, ctx, { limit: opts.limit ?? 5 });
  const chronic = recalled.filter((c) => c.hits >= minHits);
  if (chronic.length === 0) return '';
  const lines = [
    '⚠️ ⟦cortex metacognition — chronic recurrence (อุทธัจจกุกกุจจะ / thrashing): you have hit this before. Do NOT loop the same fix — confirm the prior fix actually held, or change approach.⟧',
  ];
  for (const c of chronic) {
    const fix = c.magga?.trim() ? `  (last fix: ${clamp(c.magga)})` : '';
    lines.push(`- seen ×${c.hits}: ${clamp(c.dukkha)}${fix}`);
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Efficient-Learning layer (S5-T3) — the Cognition faculty's contribution to how
// Memory consolidates. The SessionEnd distiller (lib/consolidate.ts) extracts lessons
// from a transcript; this rubric tells it HOW to make those lessons DURABLE — apply the
// same disciplines that prime live thinking to the act of learning from the session:
// Yoniso (root, not symptom), Pahāna (a repeatable fix, not a one-off), Majjhimā (keep
// only what is worth re-reading). Domain-agnostic — a good lesson is general, whatever
// the task. The samudaya/magga tags align with the อริยสัจ4 Lesson shape it feeds.
// ─────────────────────────────────────────────────────────────────────────────

/** The efficient-learning rubric: what turns a session incident into a durable, reusable lesson. */
export const LESSON_RUBRIC: string[] = [
  'Generalize: state each lesson so it transfers to a DIFFERENT future situation, not a replay of this one.',
  'Root, not symptom: the cause (samudaya) must name the underlying reason, not the surface event.',
  'Repeatable fix: the fix (magga) must read as a rule you could follow next time, not a one-off action.',
  'Right-size: keep only what is worth re-reading later — drop the trivial and the self-evident.',
];

/** Render the rubric as guidance for the consolidation distiller (S5-T3). */
export function lessonRubric(): string {
  return LESSON_RUBRIC.map((r) => `- ${r}`).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Coding discipline (S5-T6) — karpathy-guidelines, folded in but GATED to coding.
// cortex is domain-agnostic: these coding-specific imperatives must NEVER fire on
// writing / research / planning / trading work. isCodingContext() is the gate; the
// UserPromptSubmit hook injects codingDisciplineBlock() ONLY when it returns true.
// Unlike the eight disciplines above, this block DELIBERATELY carries coding vocabulary —
// that is the point — so it lives apart from the domain-agnostic cognitionPrimer().
// ─────────────────────────────────────────────────────────────────────────────

/** karpathy-guidelines, reimplemented as terse coding imperatives (the four pillars). */
export const CODING_DISCIPLINES: { name: string; line: string }[] = [
  { name: 'Think before coding', line: 'state assumptions explicitly; if multiple readings exist, surface them — don\'t pick silently.' },
  { name: 'Simplicity first', line: 'write the minimum code that solves it — no speculative abstractions, flags, or error paths.' },
  { name: 'Surgical changes', line: 'touch only what the task needs; match the surrounding style; don\'t refactor what isn\'t broken.' },
  { name: 'Goal-driven', line: 'define a verifiable success check first, then loop until it passes.' },
];

const CODING_HEADER = '⟦cortex coding discipline (karpathy; this task looks like code — informs your judgment, does not override it)⟧';

/** Render the coding-discipline block. Injected ONLY in a coding context (see isCodingContext). */
export function codingDisciplineBlock(): string {
  return [CODING_HEADER, ...CODING_DISCIPLINES.map((d) => `- ${d.name}: ${d.line}`)].join('\n') + '\n';
}

/**
 * High-precision coding-context detector — the GATE that keeps a coding-only discipline off
 * domain-agnostic work. Deliberately PRECISION-over-recall: a missed borderline coding prompt
 * is harmless (the eight domain-agnostic disciplines still apply), but a FALSE POSITIVE would
 * inject coding discipline onto writing / research / trading work and violate cortex's core
 * promise. So we match only signals that rarely appear outside code — ambiguous words that also
 * live in finance/prose ("function", "variable", "import", "position", "exception", "await")
 * are deliberately EXCLUDED. Structural patterns (a `name.ext` source path, a ``` fence, a
 * `git`/`npm`/`bun`/`cargo`/`pip` command) are the strongest tells.
 */
const CODE_PATTERN =
  /(```|\b\w[\w./-]*\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|rb|c|cc|cpp|h|hpp|cs|php|swift|kt|scala|sql|sh|bash|zsh|ya?ml|toml|gradle|json)\b|\b(?:git|npm|pnpm|yarn|bun|pip|cargo|gradle|make|docker|kubectl)\s+\w)/i;
const CODING_SIGNALS = [
  'refactor', 'debug', 'codebase', 'compile', 'compiler', 'syntax error', 'runtime error',
  'stack trace', 'stacktrace', 'segfault', 'null pointer', 'regex', 'eslint', 'linter',
  'merge conflict', 'pull request', 'rebase', 'webpack', 'typescript', 'javascript', 'golang',
  'sql query', 'api endpoint', 'recursion', 'source code', 'code review', 'unit test',
  'integration test', 'test suite', 'bug in', 'stack overflow',
];

export function isCodingContext(text: string): boolean {
  const raw = text ?? '';
  if (!raw.trim()) return false;
  if (CODE_PATTERN.test(raw)) return true;
  const t = raw.toLowerCase();
  return CODING_SIGNALS.some((s) => t.includes(s));
}
