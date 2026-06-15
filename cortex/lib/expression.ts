/**
 * Expression — speak-side token optimizer (Sprint 3).
 *
 * Where Perception compresses what Claude READS (an ollama round-trip),
 * Expression steers what Claude WRITES: a terse-style ruleset injected into the
 * session as context. No model call — pure prompt injection through hooks, so it
 * is free to compute. The SessionStart hook emits the standing ruleset (its
 * stdout becomes system context); the UserPromptSubmit hook detects the prompt's
 * language, honors the auto-clarity off-switch, and reinforces per turn.
 *
 * The rulesets are ORIGINAL reimplementations of the caveman (EN) / pordee (TH)
 * behavior — same outcome (drop filler, keep every technical token exact), own
 * wording. Pure module (no I/O): the hooks own stdin/stdout, config, and flags.
 */
export type ExprLang = 'en' | 'th';
export type ExprMode = 'lite' | 'full' | 'ultra';

/** Thai script present → 'th'. Mixed EN+TH counts as Thai (the user is writing Thai). */
const THAI = /[฀-๿]/;
export function detectLang(text: string): ExprLang {
  return THAI.test(text) ? 'th' : 'en';
}

/**
 * User-side auto-clarity: signals that THIS turn must be answered in clear,
 * normal prose, not terse. Two triggers we can see in the prompt itself:
 * (1) the user is confused / asking us to repeat, (2) the user pasted an
 * irreversible command where dropped words would risk a misread. The
 * response-side triggers (security/multi-step) live in the ruleset as a
 * self-drop instruction — the model applies those as it writes.
 */
const CLARITY_EN = /\b(what do you mean|say (that )?again|come again|i (don'?t|do not) understand|explain (it )?(clearly|again|better)|clarify|confused)\b/i;
const CLARITY_TH = /(อะไรนะ|พูดอีกที|พูดใหม่|ไม่เข้าใจ|งง|อธิบาย(ใหม่|ชัด)|ขยายความ)/;
const DANGER = /(\brm\s+-rf\b|\bdrop\s+table\b|\btruncate\s+table\b|--force\b|\breset\s+--hard\b|\bbranch\s+-D\b|\bmkfs\b|\bdd\s+if=)/i;
export function needsClarity(prompt: string): boolean {
  return CLARITY_EN.test(prompt) || CLARITY_TH.test(prompt) || DANGER.test(prompt);
}

// ── Rulesets (original wording; behaviorally equal to caveman/pordee) ─────────
const EN_PRESERVE =
  'Keep verbatim: code, CLI commands, file paths, URLs, identifiers, API/function ' +
  "names, error strings, commit-type keywords (feat/fix/...). Reply in the user's " +
  'language — compress the style, not the language. Never name or announce this mode. ' +
  'Auto-clarity: switch to normal prose for security warnings, irreversible-action ' +
  'confirmations, and multi-step sequences where dropped words risk a misread; resume after.';

const EN_LEVELS: Record<ExprMode, string> = {
  lite: 'Terse mode (lite): cut filler (just/really/basically), hedging (maybe/I think), and pleasantries (sure/happy to). Keep articles and full sentences — professional but tight.',
  full: 'Terse mode (full): drop articles (a/the), pleasantries, and hedging. Fragments fine. Short words (fix, not "implement a solution for"). No tool-call narration, no decorative tables/emoji, no raw-log dumps — quote the shortest decisive line. Pattern: [thing] [action] [reason]. [next step].',
  ultra: 'Terse mode (ultra): full rules plus — abbreviate common PROSE words only (database→DB, config→cfg, request→req, function→fn, implementation→impl); never abbreviate code symbols, function names, or API names. Arrows for causality (X → Y). One word when one word carries it.',
};

const TH_PRESERVE =
  'เก็บตามเดิมเป๊ะ: code, คำสั่ง CLI, file path, URL, identifier, ชื่อ function/API, ข้อความ error. ' +
  'เก็บ technical term อังกฤษไว้ (token, function, async, middleware, hook, build, deploy, bug, fix). ' +
  'ห้ามเอ่ยถึงหรือประกาศโหมดนี้. Auto-clarity: กลับมาเขียนไทยปกติเมื่อเป็นคำเตือนความปลอดภัย, ' +
  'การยืนยัน action ที่กู้คืนไม่ได้, หรือลำดับหลายขั้นที่ลำดับสำคัญ แล้วค่อยกลับมากระชับ.';

const TH_LEVELS: Record<'lite' | 'full', string> = {
  lite: 'โหมดกระชับ (lite): ตัดคำสุภาพ (ครับ/ค่ะ/นะคะ), คำลังเล (อาจจะ/น่าจะ/จริงๆ), คำเกริ่น (ยินดี/ได้เลย/แน่นอน). ไวยากรณ์ครบ ภาษาทางการแต่กระชับ.',
  full: 'โหมดกระชับ (full): กฎ lite + ตัดคำฟุ่มเฟือย (ที่/ซึ่ง/ว่า/อยู่/กำลัง), ตัดคำนำหน้า การ-/ความ- เมื่อใช้กริยาเดิมได้. ประโยคไม่เต็มได้. สลับคำให้สั้น: เนื่องจาก→เพราะ, หากว่า→ถ้า, ดำเนินการX→X, อย่างไรก็ตาม→แต่, ดังนั้น→เลย, ทำการแก้ไข→แก้. Pattern: [ของ] [ทำ] [เหตุผล]. [ขั้นต่อ].',
};

/** TH ships lite/full only; an 'ultra' request folds to 'full'. */
function thMode(mode: ExprMode): 'lite' | 'full' {
  return mode === 'lite' ? 'lite' : 'full';
}

/** The full ruleset for one language+mode (used to reinforce a known language). */
export function ruleset(lang: ExprLang, mode: ExprMode): string {
  return lang === 'th'
    ? `${TH_LEVELS[thMode(mode)]} ${TH_PRESERVE}`
    : `${EN_LEVELS[mode]} ${EN_PRESERVE}`;
}

/**
 * The standing instruction injected once at SessionStart. With a fixed language
 * we inject just that ruleset; with 'auto' we inject both compactly under one
 * "match the user's language" header (a one-time cost that pays back on every
 * later response). Per-turn `reinforce()` then narrows to the detected language.
 */
export function standingRuleset(mode: ExprMode, lang: ExprLang | 'auto'): string {
  if (lang === 'en' || lang === 'th') return ruleset(lang, mode);
  return (
    "Respond tersely to save tokens, matching the user's language.\n" +
    `EN — ${EN_LEVELS[mode]}\n${EN_PRESERVE}\n` +
    `TH — ${TH_LEVELS[thMode(mode)]} ${TH_PRESERVE}`
  );
}

/** Short per-turn anchor so terse style survives other plugins' mid-session injections. */
export function reinforce(lang: ExprLang, mode: ExprMode): string {
  return lang === 'th'
    ? `ตอบกระชับ (${thMode(mode)}) — ตัดคำสุภาพ/ลังเล, เก็บ technical term + code เดิม.`
    : `Stay terse (${mode}) — drop filler, keep every technical token exact.`;
}
