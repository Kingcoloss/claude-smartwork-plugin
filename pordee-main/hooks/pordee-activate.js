#!/usr/bin/env node
// pordee — Claude Code SessionStart activation hook.
// Reads state, emits Thai mode reminder via stdout when enabled.
// Stdout becomes additionalContext for the session.
// Always exits 0 — never blocks session start.

try {
  const { getState } = require('./pordee-config');
  const state = getState();

  if (!state.enabled) {
    process.exit(0);
  }

  const level = state.level === 'lite' ? 'lite' : 'full';

  const ruleset =
    `PORDEE MODE ACTIVE — level: ${level}\n\n` +
    'Respond terse like simple Thai. Keep technical English terms. ' +
    'Drop polite particles (ครับ, ค่ะ, นะคะ, นะครับ), hedging (อาจจะ, น่าจะ, จริงๆแล้ว), ' +
    'pleasantries (ได้เลยครับ, แน่นอน), and English-style filler (just/really/basically/actually/simply). ' +
    'Fragments OK. Use short Thai synonyms (ดู not ตรวจสอบ, แก้ not ทำการแก้ไข, เพราะ not เนื่องจาก).\n\n' +
    `## Persistence\n\n` +
    `ACTIVE EVERY RESPONSE. No drift. Off only via "หยุดพอดี", "พูดปกติ", or "/pordee stop".\n\n` +
    `Current level: **${level}**. Switch: \`/pordee lite|full\`.\n\n` +
    `## Pattern\n\n` +
    `\`[ของ] [ทำ] [เหตุผล]. [ขั้นต่อ].\`\n\n` +
    `## Auto-Clarity\n\n` +
    `Drop pordee for: security warnings, irreversible actions (DROP TABLE, rm -rf, git push --force, git reset --hard), ` +
    `multi-step sequences where order matters, user asks "อะไรนะ" / "พูดอีกที" / "อธิบายชัดๆ". ` +
    `Resume after clarification done.\n\n` +
    `## Boundaries\n\n` +
    `Code/commits/PRs/code comments: write normal English. Errors: exact quote. ` +
    `File paths, URLs, identifiers, function names: exact.`;

  process.stdout.write(ruleset);
  process.exit(0);
} catch (e) {
  // Never block session start. Errors logged to file by config helper.
  process.exit(0);
}
