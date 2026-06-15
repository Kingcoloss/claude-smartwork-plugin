/**
 * MCP layer deterministic GATE (Sprint 4 / S4-T8).
 *
 * Two parts, both NO ollama / NO network:
 *  1. lib/mcp.ts tool logic in-process over a seeded temp DB (enableVec:false + null embed →
 *     recall degrades to FTS keyword). Reuses the cortex-cli seed strings (proven to FTS-match).
 *  2. mcp/server.ts booted as a real subprocess — speaks JSON-RPC over stdio (initialize →
 *     tools/list) to prove the three tools register and the `.mcp.json` target actually boots.
 *
 * Run:  bun run cortex/scripts/mcp-test.ts
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
process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'cortex-mcp-cfg-'));
const { openMemory, closeMemory } = await import('../lib/memory.ts');
const { recallTool, commitTool, wikiSearchTool } = await import('../lib/mcp.ts');

// ── Part 1: lib/mcp.ts logic over a seeded FTS-only handle ────────────────────
const MEM = mkdtempSync(join(tmpdir(), 'cortex-mcp-mem-'));
const h = openMemory({ dir: MEM, enableVec: false, embed: async () => null });
if (!h) { console.log('❌ FAIL openMemory returned null (memory disabled?)'); process.exit(1); }

// commit — lesson (new → recurrence) and page (new → upsert), plus the no-shape guard
const c1 = await commitTool(h, { lesson: 'flaky test on parser timeout edgecase', cause: 'shared global state', fix: 'isolate the fixture' });
ok(/remembered a lesson \(new\)/.test(c1), 'commit lesson → new', c1);

const c2 = await commitTool(h, { lesson: 'flaky test on parser timeout edgecase', fix: 'isolate the fixture' });
ok(/recurrence — hits bumped/.test(c2), 'commit same lesson → dedup, hits bumped', c2);

const p1 = await commitTool(h, { title: 'Fixture Isolation', body: 'each test owns its fixture; never share mutable global state', tags: 'testing,isolation' });
ok(/remembered a page \(new\)/.test(p1), 'commit page → new', p1);

const p2 = await commitTool(h, { title: 'fixture isolation', body: 'updated: prefer per-test temp dirs', tags: 'testing,isolation' });
ok(/remembered a page \(updated\)/.test(p2), 'commit same title (case-insensitive) → upsert', p2);

const cbad = await commitTool(h, {});
ok(/provide a lesson .* or a page/.test(cbad), 'commit with no lesson/page → usage guidance');

// recall — hit (caveat + lesson), miss, empty query
const r1 = await recallTool(h, 'parser timeout flaky fixture');
ok(/may be STALE/i.test(r1), 'recall carries the freshness caveat (Sati-Sampajañña)');
ok(r1.includes('flaky test on parser timeout edgecase'), 'recall surfaces the stored lesson');

const r2 = await recallTool(h, 'totally unrelated zzzphlx topic');
ok(/nothing relevant/.test(r2), 'recall miss → "nothing relevant"', r2);

const r3 = await recallTool(h, '   ');
ok(/pass a query/.test(r3), 'recall empty query → guidance', r3);

// wiki_search — catalog (no query) and a query hit, plus a miss
const w1 = await wikiSearchTool(h);
ok(/LLM-Wiki — 1 page/.test(w1) && w1.includes('Fixture Isolation') && w1.includes('[testing,isolation]'),
  'wiki_search no query → catalog (1 page, first-seen casing, tags)', w1);

const w2 = await wikiSearchTool(h, 'fixture isolation');
ok(/wiki — \d+ hit/.test(w2) && w2.includes('Fixture Isolation'), 'wiki_search query → page hit', w2);

const w3 = await wikiSearchTool(h, 'zzzphlx nothing');
ok(/nothing relevant/.test(w3), 'wiki_search miss → "nothing relevant"', w3);

closeMemory(h);

// ── Part 2: boot mcp/server.ts as a subprocess, list its tools over stdio ──────
const serverScript = join(import.meta.dir, '..', 'mcp', 'server.ts');

async function bootAndListTools(): Promise<{ names: string[]; err: string }> {
  const proc = Bun.spawn(['bun', serverScript], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR!, CORTEX_MEMORY_DIR: MEM },
    stdin: 'pipe', stdout: 'pipe', stderr: 'pipe',
  });
  const killer = setTimeout(() => { try { proc.kill(); } catch {} }, 10_000);

  const msgs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'gate', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ];
  for (const m of msgs) proc.stdin.write(JSON.stringify(m) + '\n');
  await proc.stdin.end();

  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  await proc.exited;
  clearTimeout(killer);

  for (const line of out.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let msg: any;
    try { msg = JSON.parse(t); } catch { continue; }
    if (msg.id === 2 && msg.result?.tools) return { names: msg.result.tools.map((x: any) => x.name), err };
  }
  return { names: [], err };
}

const { names, err } = await bootAndListTools();
const expected = ['memory_recall', 'memory_commit', 'wiki_search'];
ok(expected.every((n) => names.includes(n)), 'server boots + registers all three tools', names.length ? names.join(',') : `no tools (stderr: ${err.slice(0, 200)})`);
ok(names.length === expected.length, 'exactly three tools, no extras', names.join(','));

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
