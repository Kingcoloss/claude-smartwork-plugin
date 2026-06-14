#!/usr/bin/env node
// pordee — UserPromptSubmit hook.
// Reads stdin: { prompt, transcript_path?, ... }
// Parses prompt for triggers (skipping content inside ``` code fences).
// Updates state.json. Emits hookSpecificOutput when pordee enabled.
// Always exits 0.

const { getState, setState, logError } = require('./pordee-config');
const { execFileSync } = require('child_process');
const path = require('path');

function stripCodeFences(text) {
  // Remove triple-backtick fenced blocks (multi-line and inline ```...```).
  return text.replace(/```[\s\S]*?```/g, '').replace(/```[\s\S]*$/, '');
}

function parseTrigger(prompt) {
  const cleaned = stripCodeFences(prompt);
  const trimmed = cleaned.trim();

  // Stats trigger — handled specially by the caller.
  // Matches /pordee-stats, /pordee:pordee-stats, and --share variant.
  if (/^\/pordee(?::pordee)?-stats(?:\s+--share)?$/.test(trimmed)) {
    return { action: 'stats', share: trimmed.includes('--share') };
  }

  // Slash commands — case-insensitive on the command, exact on args.
  // Matches /pordee, /pordee:pordee, and variants with args (lite/full/stop).
  const slashMatch = trimmed.match(/^\/pordee(?::pordee)?(?:\s+(\w+))?$/i);
  if (slashMatch) {
    const arg = (slashMatch[1] || '').toLowerCase();
    if (arg === 'lite') return { enabled: true, level: 'lite' };
    if (arg === 'full') return { enabled: true, level: 'full' };
    if (arg === 'stop') return { enabled: false };
    if (arg === '') return { enabled: true };  // bare /pordee or /pordee:pordee
    // Unknown subcommand — ignore.
    return null;
  }

  // Thai phrase triggers — match only when the trigger is the entire trimmed input.
  // Disable triggers checked first so "หยุดพอดี" wins over "พอดี" substring.
  const enableThai = ['พอดีโหมด', 'พูดสั้นๆ', 'พอดี'];
  const disableThai = ['หยุดพอดี', 'พูดปกติ'];

  for (const phrase of disableThai) {
    if (trimmed === phrase) return { enabled: false };
  }
  for (const phrase of enableThai) {
    if (trimmed === phrase) return { enabled: true };
  }

  return null;
}

function emitActiveReminder(state) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext:
        `PORDEE MODE ACTIVE (${state.level}). ` +
        `ตอบไทยกระชับ. Keep technical English terms. ` +
        `Drop polite particles, hedging, pleasantries. Fragments OK. ` +
        `Code/commits/security: write normal.`
    }
  }));
}

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').toString();
    const transcriptPath = data.transcript_path || null;

    const trigger = parseTrigger(prompt);
    if (!trigger) {
      // No trigger — just emit reminder if active
      const state = getState();
      if (state.enabled) emitActiveReminder(state);
      process.exit(0);
    }

    if (trigger.action === 'stats') {
      // Run pordee-stats.js and return its output as a blocked response
      const statsScript = path.join(__dirname, 'pordee-stats.js');
      const args = ['--session-file', transcriptPath || ''];
      if (trigger.share) args.push('--share');
      let statsOut;
      try {
        statsOut = execFileSync(process.execPath, [statsScript, ...args], {
          encoding: 'utf8',
          env: process.env,
          timeout: 5000,
        });
      } catch (statsErr) {
        statsOut = statsErr.stdout || statsErr.stderr || 'pordee-stats: failed to load stats';
      }
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: statsOut.trim(),
      }));
      process.exit(0);
    }

    // Mode trigger — update state
    setState(trigger);

    const state = getState();
    if (state.enabled) {
      emitActiveReminder(state);
    }
  } catch (e) {
    logError(`mode-tracker: ${e.message}`);
  }
  process.exit(0);
});
