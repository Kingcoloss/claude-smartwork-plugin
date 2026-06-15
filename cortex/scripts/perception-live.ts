/**
 * Sprint 2 (Perception) LIVE diagnostic — exercises the REAL compression path
 * (config → ollama.ts → /api/chat → guardrail) against a running ollama with a
 * real chat model. Answers the two open S2 questions:
 *   (a) live-LLM pass  — real compression RATIO + guardrail PASS-RATE per kind
 *   (b) latency review — cold (first call, model load) vs warm wall-clock
 *
 * Unlike perception-test.ts (a deterministic GATE that stubs ollama), this needs
 * a pulled chat model and talks to the network, so it is a DIAGNOSTIC: it SKIPs
 * when ollama/model is unavailable and always exits 0. That SKIP path is exactly
 * the graceful degradation the hook relies on.
 *
 * Run:  bun run cortex/scripts/perception-live.ts
 *   default model = cfg.ollama.compressModel
 *   override:  CORTEX_COMPRESS_MODEL=llama3.2:3b bun run scripts/perception-live.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getConfig } from '../lib/config.ts';
import { health } from '../lib/ollama.ts';
import { classify, type ContentKind } from '../lib/router.ts';
import { compress, criticalTokens } from '../lib/compress.ts';

const cfg = getConfig({ fresh: true });
const here = import.meta.dir;
const lib = (f: string) => readFileSync(join(here, '..', 'lib', f), 'utf8');

// ── Representative payloads (each clearly one kind, each > the 4000-char gate) ──
// code: real repo source — the most honest "Read a big source file" case.
const codeSample = lib('ollama.ts') + '\n' + lib('config.ts') + '\n' + lib('perception.ts');

// json: a realistic dependency/version dump, token-rich (paths, urls, versions).
const jsonSample = JSON.stringify(
  {
    name: 'cortex',
    version: '0.1.0',
    resolved: 'https://registry.npmjs.org/cortex/-/cortex-0.1.0.tgz',
    dependencies: Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [
        `pkg-${i}`,
        {
          version: `1.${i}.${(i * 7) % 13}`,
          resolved: `https://registry.npmjs.org/pkg-${i}/-/pkg-${i}-1.${i}.0.tgz`,
          integrity: `sha512-${'abcdef0123456789'.repeat(2)}${i}`,
          path: `/Users/dev/project/node_modules/pkg-${i}`,
          engines: { node: '>=18.0.0', bun: '>=1.3.0' },
        },
      ]),
    ),
  },
  null,
  2,
);

// prose: a build/error log — facts, paths, urls, codes that MUST survive.
const proseSample = (
  'Build started at 14:32:07 for commit a1b2c3d4e5f6 on branch develop. ' +
  'Step 1/4 install: resolved 412 packages from https://registry.npmjs.org in 8123 ms. ' +
  'Step 2/4 typecheck: tsc --noEmit reported 0 errors across 137 files. ' +
  'Step 3/4 test: 248 passed, 0 failed, 3 skipped; coverage 87 percent; slowest spec ' +
  '/Users/ci/runner/work/app/tests/integration/auth.spec.ts at 2041 ms. ' +
  'Step 4/4 deploy: pushed image registry.example.com/app:sha-a1b2c3d to cluster prod-east-2, ' +
  'rollout status deployment/app succeeded after 30 seconds. Warning W4021: the env var ' +
  'LEGACY_TOKEN is deprecated and will be removed in 2.0.0, migrate to API_KEY before then. '
).repeat(4);

interface Sample {
  name: string;
  text: string;
  expectKind: ContentKind;
}
const samples: Sample[] = [
  { name: 'code (real lib/*.ts)', text: codeSample, expectKind: 'code' },
  { name: 'json (dep tree)', text: jsonSample, expectKind: 'json' },
  { name: 'prose (build log)', text: proseSample, expectKind: 'prose' },
];

function mark(s: 'PASS' | 'SKIP' | 'NOOP', label: string, detail = ''): void {
  const icon = s === 'PASS' ? '✅' : s === 'NOOP' ? '➖' : '⏭️ ';
  console.log(`${icon} ${s.padEnd(4)} ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('cortex Sprint 2 — Perception LIVE diagnostic');
console.log(`  host=${cfg.ollama.host} compressModel=${cfg.ollama.compressModel}`);
console.log('');

const up = await health(cfg);
if (!up) {
  mark('SKIP', 'ollama health', 'server unreachable — diagnostic skipped (graceful no-op path)');
  process.exit(0);
}
mark('PASS', 'ollama health', 'server reachable');
console.log('');

let okCount = 0;
const ratios: number[] = [];
const latencies: number[] = [];
for (let i = 0; i < samples.length; i++) {
  const { name, text, expectKind } = samples[i];
  const kind = classify(text);
  const crit = criticalTokens(text).length;
  const routed = kind === expectKind ? `route ${kind}` : `route ${kind}!=${expectKind}`;

  const t0 = performance.now();
  const out = await compress(text, kind, cfg);
  const ms = Math.round(performance.now() - t0);
  latencies.push(ms);
  const phase = i === 0 ? 'cold' : 'warm';

  if (out) {
    const ratio = out.length / text.length;
    okCount++;
    ratios.push(ratio);
    mark(
      'PASS',
      name,
      `${routed} · ${text.length}→${out.length} (${(ratio * 100).toFixed(0)}% kept, ${crit} critical tokens preserved) · ${ms}ms ${phase}`,
    );
  } else {
    // compress() returns null for empty/down OR a guardrail trip — both mean the
    // hook would leave the original untouched. This is the safe outcome, not a bug.
    mark('NOOP', name, `${routed} · no usable compression (empty/slow or guardrail) · ${ms}ms ${phase}`);
  }
}

console.log('');
const avgRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
const cold = latencies[0];
const warm = latencies.slice(1);
const warmAvg = warm.length ? Math.round(warm.reduce((a, b) => a + b, 0) / warm.length) : 0;
console.log(
  `summary: ${okCount}/${samples.length} compressed` +
    (ratios.length ? ` · avg ${(avgRatio * 100).toFixed(0)}% of original kept` : '') +
    ` · latency cold ${cold}ms, warm avg ${warmAvg}ms (cap ${15000}ms)`,
);
process.exit(0);
