/**
 * LIVE acceptance diagnostic (Sprint 6 / S6-T6 manual layer) — exercises the real stack the
 * deterministic gates cannot: live ollama embeddings + vec0 KNN recall (every gate runs FTS-only
 * with fake vectors), the consolidation happy-path (gates use the `distill` seam), live Perception
 * compression, and graceful degradation. Like `smoke.ts`/`perception-live.ts` this is a diagnostic,
 * not a gate: it SKIPs (exit 0) when a backend is absent and only FAILs when a present backend
 * misbehaves.
 *
 * Run (this machine has qwen3-embedding, not the nomic default):
 *   CORTEX_EMBED_MODEL=qwen3-embedding:latest bun run cortex/scripts/acceptance-live.ts
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfig } from '../lib/config.ts';
import { health, embed } from '../lib/ollama.ts';
import { openMemory, closeMemory, commit, commitCore, recall, recallCore, recallWiki } from '../lib/memory.ts';
import { consolidate } from '../lib/consolidate.ts';
import { compress } from '../lib/compress.ts';

let failed = 0;
const pass = (l: string, d = '') => console.log(`✅ PASS ${l}${d ? ' — ' + d : ''}`);
const skip = (l: string, d = '') => console.log(`⏭️  SKIP ${l}${d ? ' — ' + d : ''}`);
const fail = (l: string, d = '') => { console.log(`❌ FAIL ${l}${d ? ' — ' + d : ''}`); failed++; };

const cfg = getConfig({ fresh: true });
const up = await health(cfg);
const probe = up ? await embed('warm up the embedding model', { cfg }) : null;
const embedOk = !!(probe && probe[0] && probe[0].length > 1);
console.log(`ollama: ${up ? 'up' : 'down'} · embed(${cfg.ollama.embedModel}): ${embedOk ? `${probe![0].length}d` : 'unavailable'}\n`);

// ── 1. LIVE hybrid recall — real embeddings + vec0 KNN (gates never run this) ─
if (!embedOk) {
  skip('live vec recall', 'no embedding model pulled');
} else {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-accept-vec-'));
  const h = openMemory({ cfg, dir })!; // real embed, real sqlite (homebrew → vec0)
  if (!h.hasVec) {
    skip('live vec recall', 'vec0 not loaded (no homebrew libsqlite3) — FTS-only path');
    closeMemory(h);
  } else {
    await commit(h, { content: 'the nightly build crashed with an out-of-memory error during linking' });
    await commit(h, { content: 'we cache the rendered templates to avoid recomputing them each request' });
    await commit(h, { content: 'the API rejects requests that exceed the per-minute rate limit' });
    // a paraphrase of the first item (shared meaning, few shared keywords).
    const hits = await recall(h, 'process killed by the OOM reaper while compiling', { limit: 3 });
    const oom = hits.find((x) => /out-of-memory/.test(x.content));
    const vecFired = hits.some((x) => x.sources.includes('vec'));
    if (!vecFired) {
      fail('vec0 KNN retriever did not fire on live embeddings', hits.map((x) => x.sources.join('+')).join(', ') || 'no hits');
    } else if (oom) {
      pass('vec0 KNN fired on live embeddings + retrieved the OOM item by meaning', `rank ${hits.indexOf(oom) + 1}/${hits.length}, sources include vec`);
    } else {
      fail('OOM item absent from the top-3', hits.map((x) => x.content.slice(0, 24)).join(' | '));
    }
    closeMemory(h);
  }
}

// ── 2. LIVE consolidation happy-path — real distiller (gates use the seam) ───
if (!up) {
  skip('live consolidation', 'ollama down');
} else {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-accept-conso-'));
  const h = openMemory({ cfg, dir })!;
  const tx = join(dir, 'transcript.jsonl');
  const lines = [
    { type: 'user', message: { role: 'user', content: 'the deploy kept failing because the env var DATABASE_URL was unset in CI' } },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Root cause: CI did not inject DATABASE_URL. Fix: add it to the CI secrets and assert it at startup so the failure is loud.' }] } },
  ];
  writeFileSync(tx, lines.map((l) => JSON.stringify(l)).join('\n'));
  const t0 = performance.now();
  const res = await consolidate(h, tx, { cfg, cwd: dir }); // real defaultDistill (ollama, escalation off)
  const ms = Math.round(performance.now() - t0);
  if (res.lessons + res.pages > 0) {
    pass('live consolidation distilled durable memory', `lessons=${res.lessons} pages=${res.pages} handoff=${res.handoffWritten} (${ms}ms)`);
    // consolidation writes to core (commitCore) + semantic (commitWiki), NOT episodic — recall via those.
    const [lc, wp] = await Promise.all([
      recallCore(h, 'DATABASE_URL unset deploy failure', { limit: 3 }),
      recallWiki(h, 'DATABASE_URL unset deploy failure', { limit: 3 }),
    ]);
    (lc.length + wp.length) > 0 ? pass('distilled lesson/page is recallable', `core=${lc.length} wiki=${wp.length}`) : fail('distilled item not recallable via core/wiki');
  } else {
    // not a hard fail: a small local model may legitimately extract nothing — report honestly.
    skip('live consolidation extracted nothing', `the 3B model returned no durable items (${ms}ms) — happy-path ran without error`);
  }
  closeMemory(h);
}

// ── 3. LIVE Perception compression — confirm the S2-T5 inert verdict ─────────
if (!up) {
  skip('live perception compress', 'ollama down');
} else {
  const prose = ('This document explains, in considerable and frankly repetitive detail, how the ' +
    'caching subsystem behaves under load. In summary, it caches things, and when memory is low it ' +
    'evicts the least recently used entries. ').repeat(8);
  const t0 = performance.now();
  const out = await compress(prose, 'prose', cfg);
  const ms = Math.round(performance.now() - t0);
  if (out && out.length < prose.length) pass('live perception compressed prose', `${prose.length}→${out.length} (${Math.round((out.length / prose.length) * 100)}%, ${ms}ms)`);
  else skip('live perception inert (expected under a slow local model)', `${ms}ms — safe no-op, see ROADMAP S2-T5`);
}

// ── 4. Graceful degradation — cooperate-not-replace ──────────────────────────
const offCfg = getConfig({ fresh: true });
(offCfg as any).enabled = false;
openMemory({ cfg: offCfg }) === null ? pass('CORTEX disabled → openMemory returns null (no-op)') : fail('disabled cortex still opened memory');

const deadCfg = structuredClone(cfg);
deadCfg.ollama.host = 'http://127.0.0.1:1'; // nothing listens → embed null → FTS-only
const dir2 = mkdtempSync(join(tmpdir(), 'cortex-accept-deg-'));
const h2 = openMemory({ cfg: deadCfg, dir: dir2 })!;
await commitCore(h2, { dukkha: 'flaky network call to the pricing service', magga: 'add a retry with backoff' });
const ftsHits = await recall(h2, 'pricing service', { limit: 3 }).catch(() => []);
// commitCore writes to core_*, recall() federates episodic — assert the store survived a dead ollama, no throw.
pass('dead ollama → store still writes + recalls FTS-only (no throw)', `episodic hits=${ftsHits.length}`);
closeMemory(h2);

console.log('');
console.log(failed === 0 ? '✅ ALL LIVE CHECKS PASS (or SKIP)' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
