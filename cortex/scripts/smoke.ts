/**
 * Sprint 1 smoke test — live round-trip through the subconscious bridge.
 *
 * Run:  bun run cortex/scripts/smoke.ts
 * Override models for this machine:
 *   CORTEX_EMBED_MODEL=qwen3-embedding:latest CORTEX_COMPRESS_MODEL=glm-5.1:cloud bun run scripts/smoke.ts
 *
 * This is a diagnostic, not a CI gate: it reports PASS / SKIP / FAIL per step
 * and always exits 0. SKIP is expected when ollama is down or a model isn't
 * pulled — that is exactly the graceful-degradation path cortex relies on.
 */
import { getConfig } from '../lib/config.ts';
import { health, embed, chat } from '../lib/ollama.ts';
import { escalationAvailable, escalate } from '../lib/escalate.ts';

const cfg = getConfig({ fresh: true });

function line(status: 'PASS' | 'SKIP' | 'FAIL', label: string, detail = ''): void {
  const mark = status === 'PASS' ? '✅' : status === 'SKIP' ? '⏭️ ' : '❌';
  console.log(`${mark} ${status.padEnd(4)} ${label}${detail ? ' — ' + detail : ''}`);
}

console.log('cortex Sprint 1 smoke test');
console.log(`  host=${cfg.ollama.host} cloud=${cfg.ollama.cloud}`);
console.log(`  embedModel=${cfg.ollama.embedModel} compressModel=${cfg.ollama.compressModel}`);
console.log('');

// 1. Health
const up = await health(cfg);
line(up ? 'PASS' : 'SKIP', 'ollama health', up ? 'server reachable' : 'server unreachable');

// 2. Embed round-trip
if (up) {
  const vecs = await embed('cortex turns memory into a searchable brain', { cfg });
  if (vecs && vecs[0]) line('PASS', 'embed round-trip', `dims=${vecs[0].length}`);
  else line('SKIP', 'embed round-trip', `model "${cfg.ollama.embedModel}" unavailable`);
} else {
  line('SKIP', 'embed round-trip', 'ollama down');
}

// 3. Compress round-trip (chat)
const sample =
  'The PostToolUse hook fires after a tool returns. When a tool output exceeds the ' +
  'configured threshold, cortex routes it to ollama for compression before Claude reads it, ' +
  'storing the original so it stays retrievable. This cuts read-side tokens.';
if (up) {
  const out = await chat(
    [
      { role: 'system', content: 'Compress the user text to one terse sentence. Keep technical accuracy.' },
      { role: 'user', content: sample },
    ],
    { cfg },
  );
  if (out) line('PASS', 'compress round-trip', `${out.replace(/\s+/g, ' ').trim().slice(0, 80)}…`);
  else line('SKIP', 'compress round-trip', `model "${cfg.ollama.compressModel}" unavailable`);
} else {
  line('SKIP', 'compress round-trip', 'ollama down');
}

// 4. Claude escalation via `claude` CLI (opt-in; uses Claude Code's own auth)
if (escalationAvailable(cfg)) {
  const out = await escalate(
    [{ role: 'user', content: 'Reply with exactly: cortex-ok' }],
    { cfg },
  );
  if (out) line('PASS', `escalation (${cfg.escalation.model})`, out.slice(0, 40));
  else line('FAIL', `escalation (${cfg.escalation.model})`, 'enabled but `claude` call failed');
} else {
  line('SKIP', 'escalation', 'opt-in (escalation.enabled)');
}
