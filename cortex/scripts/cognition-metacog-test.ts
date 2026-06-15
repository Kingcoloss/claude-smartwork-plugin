/**
 * Cognition metacognition deterministic GATE (Sprint 5 / S5-T2).
 * Two parts, no ollama / no network:
 *  1. นิวรณ์5 (HINDRANCES) content + hindranceBlock — pure; domain-agnostic enforced.
 *  2. metacognitionFlag — the Memory→Cognition link — over a seeded Core Memory (a lesson
 *     committed 3× → hits=3 = chronic; recall degrades to FTS keyword, no embeddings).
 *
 * Run:  bun run cortex/scripts/cognition-metacog-test.ts
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

// Isolate config BEFORE importing (getConfig caches; configDir() reads the env).
process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cortex-metacog-cfg-'));
const { HINDRANCES, hindranceBlock, metacognitionFlag } = await import('../lib/cognition.ts');
const { openMemory, closeMemory, commitCore } = await import('../lib/memory.ts');

// ── 1. the five hindrances, well-formed + distinct ───────────────────────────
ok(HINDRANCES.length === 5, 'exactly five hindrances (นิวรณ์5)', String(HINDRANCES.length));
ok(HINDRANCES.every((d) => d.name.trim() && d.pali.trim() && d.line.trim()), 'every hindrance has name + pali + line');
ok(new Set(HINDRANCES.map((d) => d.pali)).size === 5, 'all five Pali tags are distinct');

const hblock = hindranceBlock();
ok(hblock.includes('metacognition') && hblock.includes('นิวรณ์5'), 'block carries the metacognition / นิวรณ์5 header');
ok(/observe it, don't suppress it/i.test(hblock), 'block frames สติปัฏฐาน self-observation (observe, not suppress)');
ok(HINDRANCES.every((d) => hblock.includes(d.pali) && hblock.includes(d.name)), 'block renders every hindrance');

// domain-agnostic — the explicit S5 requirement; also reject the source's coding-only "revenge coding"
const CODING_ONLY = ['code', 'compile', 'function', 'variable', 'repo', 'commit', 'refactor', 'debug', 'deploy', 'merge', 'revenge'];
const leaked = CODING_ONLY.filter((w) => hblock.toLowerCase().includes(w));
ok(leaked.length === 0, 'hindrance block has no coding-only vocabulary (domain-agnostic)', leaked.join(',') || 'clean');
ok(hblock.length < 1200 && hblock.trim().split('\n').slice(1).every((l) => l.length < 160), 'block is token-frugal');

// ── 2. metacognitionFlag — Memory→Cognition red-flag on chronic recurrence ───
const MEM = mkdtempSync(join(tmpdir(), 'cortex-metacog-mem-'));
const h = openMemory({ dir: MEM, enableVec: false, embed: async () => null });
if (!h) { console.log('❌ FAIL openMemory returned null'); process.exit(1); }

// chronic: same lesson committed 3× → hits bumps to 3
for (let i = 0; i < 3; i++) await commitCore(h, { dukkha: 'deadlock on the shared connection lock', magga: 'acquire locks in a fixed global order' });
// fresh: a one-off lesson → hits 1
await commitCore(h, { dukkha: 'rare timezone offset miscalculation', magga: 'normalize to UTC at the boundary' });

const flag = await metacognitionFlag(h, 'deadlock shared connection lock', { minHits: 3 });
ok(/อุทธัจจกุกกุจจะ/.test(flag) && /seen ×3/.test(flag), 'chronic recurrence (hits≥3) raises the thrashing red-flag', flag.split('\n')[0]?.slice(0, 60));
ok(flag.includes('deadlock on the shared connection lock'), 'flag names the recurring problem (dukkha)');
ok(/last fix: acquire locks/.test(flag), 'flag surfaces the prior fix (magga)');

const tooHigh = await metacognitionFlag(h, 'deadlock shared connection lock', { minHits: 5 });
ok(tooHigh === '', 'hits=3 below minHits=5 → no flag (tunable sensitivity)');

const fresh = await metacognitionFlag(h, 'timezone offset miscalculation', { minHits: 3 });
ok(fresh === '', 'a one-off lesson (hits=1) → no flag');

ok((await metacognitionFlag(h, '   ', { minHits: 3 })) === '', 'empty context → no-op');
ok((await metacognitionFlag(h, 'totally unrelated zzzphlx topic', { minHits: 3 })) === '', 'no recall match → no flag');

closeMemory(h);

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
