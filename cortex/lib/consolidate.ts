/**
 * Consolidation — distil a finished session into durable memory (Sprint 4 / S4-T6).
 *
 * At SessionEnd a hook hands us the session's `transcript_path`. The transcript IS the
 * raw episodic record (nothing writes episodic live yet — see ROADMAP), so we treat it
 * as the bottom of the staging ladder and distil UPWARD (Anupubbikathā / วิสุทธิ-like):
 *
 *   transcript (episodic, raw)  →  pages (semantic / LLM-Wiki)  +  lessons (core / อริยสัจ4)
 *
 * The distillation itself is one LLM call: ollama by default, escalated to Claude (Haiku
 * etc.) via the `claude` CLI when that opt-in tier is on (more accurate for this job). The
 * `distill` seam lets the gate drive the whole pipeline deterministically with no network.
 *
 * We also auto-write `.cortex/handoff.md` — the file the Cognition hook (S5-T8) reads to
 * warm-start sub-agents — closing its "handoff is manually maintained for now" gap.
 *
 * Cooperate-not-replace: unreadable transcript, down LLM, or malformed output each degrade
 * to "wrote less / nothing", never an exception. A human-authored handoff is never clobbered.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { CortexConfig } from './config.ts';
import { getConfig } from './config.ts';
import { chat, type ChatMessage } from './ollama.ts';
import { escalate, escalationAvailable } from './escalate.ts';
import { commitCore, commitWiki, type MemoryHandle } from './memory.ts';
import { lessonRubric } from './cognition.ts';
import { debug } from './log.ts';

export interface Lesson { dukkha: string; samudaya?: string; nirodha?: string; magga?: string; }
export interface Page { title: string; body: string; tags?: string; }
export interface Distillation { lessons: Lesson[]; pages: Page[]; handoff: string; }

/** The distillation LLM call (transcript-digest prompt → raw text). Overridable in tests. */
export type DistillFn = (messages: ChatMessage[]) => Promise<string | null>;

const MAX_DIGEST_CHARS = 6_000;          // cap what we feed the model — keep the recent tail
const HANDOFF_MARKER = '<!-- cortex:auto-generated handoff -->';

/** Pull readable text from a transcript entry's `message.content` (string or block array). */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text)
      .join('\n')
      .trim();
  }
  return '';
}

/**
 * Read a Claude Code transcript JSONL into a compact User/Assistant digest: real prose only
 * (tool_use / tool_result blocks and isMeta entries are dropped as noise), keeping the most
 * RECENT turns that fit `maxChars` (recency is what a handoff/lesson cares about). '' when
 * the file is unreadable or carries no usable text.
 */
export function digestTranscript(path: string, maxChars: number = MAX_DIGEST_CHARS): string {
  let raw: string;
  try { raw = readFileSync(path, 'utf8'); } catch { return ''; }

  const turns: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }
    if (o?.isMeta) continue;
    if (o?.type === 'user' && o?.message?.role === 'user') {
      const t = extractText(o.message.content);
      if (t) turns.push(`User: ${t}`);
    } else if (o?.type === 'assistant') {
      const t = extractText(o?.message?.content);
      if (t) turns.push(`Assistant: ${t}`);
    }
  }
  if (turns.length === 0) return '';

  let out = '';
  for (let i = turns.length - 1; i >= 0; i--) {        // walk newest → oldest, stop at the cap
    const next = out ? turns[i] + '\n' + out : turns[i];
    if (next.length > maxChars) break;
    out = next;
  }
  return out.trim();
}

/** The consolidation prompt — domain-agnostic, asks for strict JSON we can parse. */
export function buildPrompt(digest: string): ChatMessage[] {
  const system =
    'You consolidate a finished work session into durable memory. The work may be ANY ' +
    'domain (coding, writing, research, planning, etc.) — stay domain-agnostic. From the ' +
    'transcript digest, extract only DURABLE, REUSABLE items (skip the trivial):\n' +
    '- lessons: a problem/mistake hit and how it was (or should be) resolved.\n' +
    '- pages: a reusable concept or piece of knowledge worth keeping.\n' +
    '- handoff: <=120 words telling the NEXT session what to pick up.\n' +
    'When extracting a lesson, apply this efficient-learning rubric so it stays DURABLE:\n' +
    lessonRubric() + '\n' +
    'Empty arrays are fine. Respond with ONLY a JSON object — no prose, no code fence:\n' +
    '{"lessons":[{"dukkha":"problem","samudaya":"root cause","nirodha":"resolved state","magga":"the fix"}],' +
    '"pages":[{"title":"concept","body":"the knowledge","tags":"comma,list"}],"handoff":"text"}';
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Transcript digest:\n\n${digest}` },
  ];
}

const str = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || undefined;
};

/** Extract the first balanced top-level {...} object from possibly prose/fence-wrapped text. */
function extractJsonObject(text: string): any | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

/**
 * Parse the model's output into validated lessons/pages/handoff. Tolerant: unwraps a JSON
 * object out of any surrounding prose, drops entries missing their required field, and
 * returns all-empty on any failure (→ nothing gets written).
 */
export function parseDistillation(text: string | null): Distillation {
  const empty: Distillation = { lessons: [], pages: [], handoff: '' };
  if (!text) return empty;
  const obj = extractJsonObject(text);
  if (!obj || typeof obj !== 'object') return empty;

  const lessons: Lesson[] = Array.isArray(obj.lessons)
    ? obj.lessons
        .filter((l: any) => l && typeof l.dukkha === 'string' && l.dukkha.trim())
        .map((l: any) => ({ dukkha: String(l.dukkha).trim(), samudaya: str(l.samudaya), nirodha: str(l.nirodha), magga: str(l.magga) }))
    : [];
  const pages: Page[] = Array.isArray(obj.pages)
    ? obj.pages
        .filter((p: any) => p && typeof p.title === 'string' && p.title.trim() && typeof p.body === 'string' && p.body.trim())
        .map((p: any) => ({ title: String(p.title).trim(), body: String(p.body).trim(), tags: str(p.tags) }))
    : [];
  const handoff = typeof obj.handoff === 'string' ? obj.handoff.trim() : '';
  return { lessons, pages, handoff };
}

/** Default distiller: prefer the (accurate) escalation tier when on, else local ollama. */
export function defaultDistill(cfg: CortexConfig): DistillFn {
  return async (messages) => {
    if (escalationAvailable(cfg)) {
      const esc = await escalate(messages, { cfg });
      if (esc) return esc;
    }
    return chat(messages, { cfg, options: { temperature: 0 } });
  };
}

/**
 * Write the auto-handoff to `.cortex/handoff.md`, the file the Cognition hook reads. Cortex
 * owns this file (marked), but NEVER clobbers a human-authored one: an existing non-empty
 * file without our marker is preserved. Returns whether it wrote. Empty handoff → skip.
 */
export function writeHandoff(cwd: string, handoff: string): boolean {
  if (!handoff.trim()) return false;
  const path = join(cwd, '.cortex', 'handoff.md');
  try {
    if (existsSync(path)) {
      const cur = readFileSync(path, 'utf8');
      if (cur.trim() && !cur.includes(HANDOFF_MARKER)) {
        debug('memory', 'consolidate', 'handoff.md is human-authored (no cortex marker) → preserved');
        return false;
      }
    } else {
      mkdirSync(dirname(path), { recursive: true });
    }
    writeFileSync(path, `${HANDOFF_MARKER}\n${handoff.trim()}\n`, 'utf8');
    return true;
  } catch (e) {
    debug('memory', 'writeHandoff', (e as Error)?.message);
    return false;
  }
}

/**
 * Distil one session transcript into memory: digest → LLM → write lessons (commitCore,
 * which dedups + bumps `hits`), pages (commitWiki, upsert by title), and the handoff.
 * Best-effort throughout; returns how much landed. No usable digest → no LLM call, zeros.
 */
export async function consolidate(
  h: MemoryHandle,
  transcriptPath: string,
  opts: { cfg?: CortexConfig; distill?: DistillFn; cwd?: string } = {},
): Promise<{ lessons: number; pages: number; handoffWritten: boolean }> {
  const digest = digestTranscript(transcriptPath);
  if (!digest) return { lessons: 0, pages: 0, handoffWritten: false };

  const cfg = opts.cfg ?? getConfig();
  const distill = opts.distill ?? defaultDistill(cfg);
  const { lessons, pages, handoff } = parseDistillation(await distill(buildPrompt(digest)));

  let nLessons = 0, nPages = 0;
  for (const l of lessons) if (await commitCore(h, l)) nLessons++;
  for (const p of pages) if (await commitWiki(h, p)) nPages++;
  const handoffWritten = writeHandoff(opts.cwd ?? process.cwd(), handoff);
  return { lessons: nLessons, pages: nPages, handoffWritten };
}
