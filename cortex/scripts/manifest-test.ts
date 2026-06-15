/**
 * Manifest + skill validation GATE (Sprint 6 / S6-T3 plugin-validator · S6-T4 skill-reviewer).
 *
 * A deterministic, repeatable stand-in for a one-shot validator/reviewer agent pass: asserts the
 * plugin manifest, the marketplace entry, the MCP manifest, the hook manifest, and every skill's
 * frontmatter are well-formed and mutually consistent — the things that break a public install.
 * Pure file checks, no network.
 *
 * Run:  bun run cortex/scripts/manifest-test.ts
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, detail = ''): void {
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

const root = join(import.meta.dir, '..');              // cortex/
const repo = join(root, '..');                         // marketplace repo root
const readJson = (p: string): any => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const SEMVER = /^\d+\.\d+\.\d+$/;

// ── 1. plugin.json ───────────────────────────────────────────────────────────
const plugin = readJson(join(root, '.claude-plugin', 'plugin.json'));
ok(plugin !== null, 'plugin.json is valid JSON');
ok(plugin?.name === 'cortex', 'plugin name is "cortex"', plugin?.name);
ok(SEMVER.test(plugin?.version ?? ''), 'plugin version is semver', plugin?.version);
ok(typeof plugin?.description === 'string' && plugin.description.length > 40, 'plugin has a real description');
ok(plugin?.license === 'BUSL-1.1', 'plugin license is BUSL-1.1', plugin?.license);
ok(Array.isArray(plugin?.keywords) && plugin.keywords.length >= 3, 'plugin has keywords (discovery surface)');

// ── 2. marketplace.json — entry consistent with the plugin it points at ──────
const market = readJson(join(repo, '.claude-plugin', 'marketplace.json'));
ok(market !== null, 'marketplace.json is valid JSON');
ok(market?.name === 'claude-smartwork', 'marketplace name is "claude-smartwork"', market?.name);
const entry = (market?.plugins ?? []).find((p: any) => p.name === 'cortex');
ok(!!entry, 'marketplace lists the cortex plugin');
ok(entry?.source === './cortex', 'cortex source path is "./cortex"', entry?.source);
ok(existsSync(join(repo, entry?.source ?? '', '.claude-plugin', 'plugin.json')), 'source path resolves to a plugin manifest');
ok(entry?.version === plugin?.version, 'marketplace entry version matches plugin.json', `${entry?.version} vs ${plugin?.version}`);

// no manifest may advertise a dependency the plugin does not ship (Elysia is deferred per D11).
const advertised = `${plugin?.description ?? ''} ${entry?.description ?? ''} ${market?.metadata?.description ?? ''}`.toLowerCase();
ok(!advertised.includes('elysia'), 'no manifest claims Elysia (not shipped — deferred per D11)');

// ── 3. .mcp.json — the optional pull-layer server resolves ───────────────────
const mcp = readJson(join(root, '.mcp.json'));
ok(mcp !== null, '.mcp.json is valid JSON');
const server = mcp?.mcpServers?.['cortex-memory'];
const mcpScript = (server?.args ?? []).join(' ');
ok(server?.command === 'bash', 'cortex-memory MCP server launches via a bash wrapper', server?.command);
ok(/mcp\/server\.ts/.test(mcpScript) && existsSync(join(root, 'mcp', 'server.ts')), 'MCP wrapper execs the existing mcp/server.ts');
ok(/ensure-deps\.sh/.test(mcpScript) && existsSync(join(root, 'scripts', 'ensure-deps.sh')), 'MCP wrapper self-provisions deps via ensure-deps.sh (first-run fix for -32000)');

// ── 4. hooks.json — valid + every referenced hook file present ───────────────
const hooks = readJson(join(root, 'hooks', 'hooks.json'));
ok(hooks !== null, 'hooks.json is valid JSON');
const hookFiles: string[] = [];
for (const groups of Object.values(hooks?.hooks ?? {})) for (const g of groups as any[]) for (const h of g.hooks ?? []) {
  const m = /hooks\/([\w-]+\.ts)/.exec(h.command ?? '');
  if (m) hookFiles.push(m[1]);
}
ok(hookFiles.length > 0 && hookFiles.every((f) => existsSync(join(root, 'hooks', f))), 'every hooks.json command targets an existing file');

// ── 5. skills — frontmatter well-formed, name matches dir, triggers present ──
function frontmatter(md: string): { name?: string; description?: string } {
  const m = /^---\s*\n([\s\S]*?)\n---/.exec(md);
  if (!m) return {};
  const name = /^\s*name:\s*(.+?)\s*$/m.exec(m[1])?.[1];
  const description = /^\s*description:\s*(.+?)\s*$/m.exec(m[1])?.[1];
  return { name, description };
}
const skillsDir = join(root, 'skills');
const skillDirs = readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
ok(['cortex', 'cortex-recall', 'cortex-remember', 'cortex-think'].every((s) => skillDirs.includes(s)), 'all four skills present', skillDirs.join(','));
for (const dir of skillDirs) {
  const path = join(skillsDir, dir, 'SKILL.md');
  ok(existsSync(path), `${dir}: has SKILL.md`);
  const fm = frontmatter(existsSync(path) ? readFileSync(path, 'utf8') : '');
  ok(fm.name === dir, `${dir}: frontmatter name matches directory`, fm.name);
  ok(!!fm.description && fm.description.length > 60, `${dir}: has a substantive description`, `${fm.description?.length ?? 0} chars`);
  ok(!!fm.description && /use when|`\//i.test(fm.description), `${dir}: description states a trigger ("Use when" / a /command)`);
}

console.log('');
console.log(failed === 0 ? '✅ ALL PASS' : `❌ ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
