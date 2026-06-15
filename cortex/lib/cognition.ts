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
 */

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
