/**
 * Content router (Sprint 2 / S2-T2). Pure, no I/O, no deps.
 *
 * Classifies a tool output's text so the compressor (S2-T3) can pick a
 * preservation strategy. The three kinds need different handling: JSON wants a
 * structural digest, code/CLI output must keep symbols + line numbers, prose
 * can be summarized. Misclassification only costs compression ratio, never
 * correctness — the post-compression guardrail in `compress.ts` is what keeps
 * us safe, so these heuristics stay cheap and approximate on purpose.
 */
export type ContentKind = 'json' | 'code' | 'prose';

/** Line-level signals that mark source code or structured CLI output. */
const CODE_LINE =
  /(^[ \t]+\S)|[{};]|=>|^\S+:\d+:|^[+\-@]|\b(function|const|let|var|def|class|import|export|return|public|private|async|await)\b/;

function parsesAsJson(t: string): boolean {
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** Fraction of non-empty lines that look like code (0..1). */
function codeDensity(t: string): number {
  const lines = t.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return 0;
  let hits = 0;
  for (const l of lines) if (CODE_LINE.test(l)) hits++;
  return hits / lines.length;
}

export function classify(text: string): ContentKind {
  const t = text.trim();
  if (!t) return 'prose';
  if ((t[0] === '{' || t[0] === '[') && parsesAsJson(t)) return 'json';
  if (codeDensity(t) >= 0.4) return 'code';
  return 'prose';
}
