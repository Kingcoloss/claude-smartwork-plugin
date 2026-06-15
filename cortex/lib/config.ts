/**
 * cortex config resolution. Runtime: Bun (TypeScript, no build step).
 *
 * Precedence (high -> low):
 *   1. Environment variables
 *   2. Project settings   <cwd>/.claude/cortex.local.md  (walks up to filesystem root)
 *   3. User settings      $CLAUDE_CONFIG_DIR/cortex.local.md  (or ~/.claude/cortex.local.md)
 *   4. Built-in defaults
 *
 * Settings files use the plugin-settings pattern: a YAML-ish frontmatter block
 * (--- ... ---) of simple `key: value` lines. Dotted keys (e.g.
 * `ollama.compressModel: llama3.2:3b`) map into the nested config. No deps.
 *
 * Design note (cooperate, not replace): every consumer must treat cortex as
 * OPTIONAL. If `enabled` is false or a backend (ollama/Bun) is missing, callers
 * degrade to a no-op so native Claude Code behavior is never blocked.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export interface CortexConfig {
  enabled: boolean;
  ollama: {
    host: string;
    apiKey: string | null;
    embedModel: string;
    compressModel: string;
    cloud: boolean;
  };
  escalation: { enabled: boolean; model: string };
  perception: { enabled: boolean; thresholdChars: number; timeoutMs: number };
  expression: { enabled: boolean; mode: 'lite' | 'full' | 'ultra' };
  memory: { enabled: boolean; dir: string | null };
}

const DEFAULTS: CortexConfig = {
  enabled: true,
  ollama: {
    host: 'http://localhost:11434', // local default; set to https://ollama.com for cloud
    apiKey: null,                   // required for ollama cloud
    embedModel: 'nomic-embed-text',
    compressModel: 'qwen2.5:3b',
    cloud: false,                   // derived from host
  },
  escalation: {
    enabled: false,                 // opt-in tier above ollama for consolidation accuracy
    model: 'sonnet',                // any `claude -p --model` value: sonnet | opus | haiku | claude-*
  },
  // timeoutMs caps the SYNCHRONOUS in-hook compression wait. Measured: a local
  // 3B model at ~33 tok/s cannot finish even a 2.5KB compression within 15s, so
  // this is the knob that trades latency for feature reach — lower it to fail
  // fast on slow backends, raise it only with a faster model. See ROADMAP S2-T3.
  perception: { enabled: true, thresholdChars: 4000, timeoutMs: 15_000 },
  expression: { enabled: true, mode: 'full' },
  memory: { enabled: true, dir: null },
};

export function configDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

/** Parse a leading `--- ... ---` frontmatter block into a flat {key: value} map. */
export function parseFrontmatter(text: string): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const m = /^---\s*\n([\s\S]*?)\n---/m.exec(text || '');
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const mm = /^\s*([A-Za-z0-9_.]+)\s*:\s*(.+?)\s*$/.exec(line);
    if (!mm) continue;
    let v: string | number | boolean = mm[2].trim();
    if (/^(true|false)$/i.test(v)) v = v.toLowerCase() === 'true';
    else if (/^-?\d+$/.test(v)) v = parseInt(v, 10);
    else v = v.replace(/^["']|["']$/g, '');
    out[mm[1]] = v;
  }
  return out;
}

function setDotted(obj: any, key: string, val: unknown): void {
  const parts = key.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {};
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = val;
}

function readSettingsFile(file: string | null): Record<string, unknown> {
  try {
    if (!file || !existsSync(file)) return {};
    return parseFrontmatter(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function findProjectSettings(start?: string): string | null {
  let dir = start || process.cwd();
  for (let i = 0; i < 64; i++) {
    const f = join(dir, '.claude', 'cortex.local.md');
    try {
      if (existsSync(f)) return f;
    } catch {}
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function applyFlat(cfg: CortexConfig, flat: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(flat)) setDotted(cfg, k, v);
}

function applyEnv(cfg: CortexConfig): void {
  const e = process.env;
  if (e.CORTEX_ENABLED != null) cfg.enabled = e.CORTEX_ENABLED !== '0' && e.CORTEX_ENABLED !== 'false';
  if (e.OLLAMA_HOST) cfg.ollama.host = e.OLLAMA_HOST;
  if (e.OLLAMA_API_KEY) cfg.ollama.apiKey = e.OLLAMA_API_KEY;
  if (e.CORTEX_EMBED_MODEL) cfg.ollama.embedModel = e.CORTEX_EMBED_MODEL;
  if (e.CORTEX_COMPRESS_MODEL) cfg.ollama.compressModel = e.CORTEX_COMPRESS_MODEL;
  if (e.CORTEX_ESCALATION != null) cfg.escalation.enabled = e.CORTEX_ESCALATION === '1' || e.CORTEX_ESCALATION === 'true';
  if (e.CORTEX_ESCALATION_MODEL) cfg.escalation.model = e.CORTEX_ESCALATION_MODEL;
  if (e.CORTEX_MEMORY_DIR) cfg.memory.dir = e.CORTEX_MEMORY_DIR;
}

let _cached: CortexConfig | null = null;

export function getConfig(opts: { fresh?: boolean; cwd?: string } = {}): CortexConfig {
  if (_cached && !opts.fresh) return _cached;
  const cfg: CortexConfig = structuredClone(DEFAULTS);
  applyFlat(cfg, readSettingsFile(join(configDir(), 'cortex.local.md'))); // user
  applyFlat(cfg, readSettingsFile(findProjectSettings(opts.cwd)));        // project
  applyEnv(cfg);                                                          // env
  if (!cfg.memory.dir) cfg.memory.dir = join(configDir(), 'cortex', 'memory');
  cfg.ollama.cloud = /ollama\.com/i.test(cfg.ollama.host || '');
  _cached = cfg;
  return cfg;
}

export { DEFAULTS };
