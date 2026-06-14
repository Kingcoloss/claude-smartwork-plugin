#!/usr/bin/env node
// pordee-stats — read active Claude Code session log, print token usage + savings.
// Based on caveman-stats.js. Uses median compression from benchmarks/compression.json.
//
// Run directly:    node hooks/pordee-stats.js
// Inside Claude:   /pordee-stats triggers this via UserPromptSubmit hook.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getState } = require('./pordee-config');

// Approximate output-token pricing, USD per million.
// Anthropic + Kimi models. Update when pricing changes.
const MODEL_OUTPUT_PRICE_PER_M = [
  ['claude-opus-4', 75.00],
  ['claude-sonnet-4', 15.00],
  ['claude-haiku-4', 4.00],
  ['claude-3-5-sonnet', 15.00],
  ['claude-3-5-haiku', 4.00],
  ['claude-3-opus', 75.00],
  ['kimi-for-coding', 15.00],
  ['kimi-k2-5', 15.00],
];

function loadCompression() {
  const benchmarkDir = process.env.PORDEE_BENCHMARK_DIR || path.join(__dirname, '..', 'benchmarks');
  const compressionPath = path.join(benchmarkDir, 'compression.json');
  try {
    const data = JSON.parse(fs.readFileSync(compressionPath, 'utf8'));
    return data.compression || {};
  } catch {
    return {};
  }
}

function priceForModel(model) {
  if (!model) return null;
  for (const [prefix, price] of MODEL_OUTPUT_PRICE_PER_M) {
    if (model.startsWith(prefix)) return price;
  }
  return null;
}

function formatUsd(amount) {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}

function findRecentSession(claudeDir) {
  const projectsDir = path.join(claudeDir, 'projects');
  let entries;
  try { entries = fs.readdirSync(projectsDir, { withFileTypes: true }); }
  catch { return null; }

  let best = null;
  const stack = entries.map(e => path.join(projectsDir, e.name));
  while (stack.length) {
    const p = stack.pop();
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      try {
        for (const child of fs.readdirSync(p)) stack.push(path.join(p, child));
      } catch {}
    } else if (p.endsWith('.jsonl') && (!best || st.mtimeMs > best.mtime)) {
      best = { file: p, mtime: st.mtimeMs };
    }
  }
  return best ? best.file : null;
}

function parseSession(filePath) {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); }
  catch { return { outputTokens: 0, cacheReadTokens: 0, turns: 0, model: null }; }

  let outputTokens = 0;
  let cacheReadTokens = 0;
  let turns = 0;
  let model = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== 'assistant' || !entry.message) continue;
    const usage = entry.message.usage;
    if (!usage) continue;
    outputTokens += usage.output_tokens || 0;
    cacheReadTokens += usage.cache_read_input_tokens || 0;
    turns++;
    if (!model && entry.message.model) model = entry.message.model;
  }
  return { outputTokens, cacheReadTokens, turns, model };
}

function deriveSavings({ outputTokens, level, model }) {
  const compression = loadCompression();
  const ratio = compression[level] != null ? compression[level] : null;
  const price = priceForModel(model);
  if (ratio === null) return { estSavedTokens: 0, estSavedUsd: 0 };
  const estNormal = Math.round(outputTokens / (1 - ratio));
  const estSavedTokens = estNormal - outputTokens;
  const estSavedUsd = price !== null ? (estSavedTokens / 1_000_000) * price : 0;
  return { estSavedTokens, estSavedUsd };
}

function parseDuration(spec) {
  if (!spec) return null;
  const m = /^(\d+)([dh])$/.exec(spec.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return m[2] === 'd' ? n * 86_400_000 : n * 3_600_000;
}

function readHistory(historyPath) {
  try {
    return fs.readFileSync(historyPath, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function appendHistory(historyPath, line) {
  try {
    const dir = path.dirname(historyPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(historyPath, line + '\n');
  } catch {
    // Best-effort
  }
}

function aggregateHistory(historyPath, sinceMs) {
  const lines = readHistory(historyPath);
  const cutoff = sinceMs ? Date.now() - sinceMs : null;
  const latestPerSession = new Map();
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || typeof entry !== 'object') continue;
    if (cutoff !== null && (entry.ts || 0) < cutoff) continue;
    const id = entry.session_id || '_';
    const prev = latestPerSession.get(id);
    if (!prev || (entry.ts || 0) >= (prev.ts || 0)) latestPerSession.set(id, entry);
  }
  let outputTokens = 0, estSavedTokens = 0, estSavedUsd = 0;
  for (const e of latestPerSession.values()) {
    outputTokens += e.output_tokens || 0;
    estSavedTokens += e.est_saved_tokens || 0;
    estSavedUsd += e.est_saved_usd || 0;
  }
  return { sessions: latestPerSession.size, outputTokens, estSavedTokens, estSavedUsd };
}

function humanizeTokens(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

function formatHistory({ sessions, outputTokens, estSavedTokens, estSavedUsd, since }) {
  const sep = '──────────────────────────────────';
  const window = since ? ` (last ${since})` : '';
  if (sessions === 0) {
    return `\nพอดี Stats — สะสม${window}\n${sep}\nยังไม่มี session — รัน /pordee-stats ใน session ใดก็ได้เพื่อเริ่มเก็บข้อมูล\n${sep}\n`;
  }
  const usdLine = estSavedUsd > 0 ? `ประหยัด (USD):        ~${formatUsd(estSavedUsd)}\n` : '';
  return `\nพอดี Stats — สะสม${window}\n${sep}\n` +
    `Sessions:   ${sessions.toLocaleString()}\n${sep}\n` +
    `Output tokens:         ${outputTokens.toLocaleString()}\n` +
    `ประหยัดโทเค็น:        ${estSavedTokens.toLocaleString()}\n` +
    usdLine + sep + '\n';
}

function formatShare({ outputTokens, turns, level, model }) {
  if (turns === 0) {
    return '⚡ พอดีพร้อม แต่ยังไม่มีเทิร์น — pordee';
  }
  const compression = loadCompression();
  const ratio = compression[level] != null ? compression[level] : null;
  const price = priceForModel(model);

  if (ratio !== null) {
    const estSaved = Math.round(outputTokens / (1 - ratio)) - outputTokens;
    let usd = '';
    if (price !== null) {
      const amt = (estSaved / 1_000_000) * price;
      usd = ` (~${formatUsd(amt)})`;
    }
    return `⚡ ประหยัด ${estSaved.toLocaleString()} output tokens${usd} จาก ${turns} เทิร์นใน session นี้ — pordee`;
  }
  return `⚡ ${turns} เทิร์น, ${outputTokens.toLocaleString()} output tokens ใน session นี้ — pordee`;
}

function formatStats({ outputTokens, cacheReadTokens, turns, level, model, sessionPath }) {
  const sep = '──────────────────────────────────';
  const shortPath = sessionPath && sessionPath.length > 45
    ? '...' + sessionPath.slice(-45)
    : (sessionPath || '');

  if (turns === 0) {
    return `\nพอดี Stats\n${sep}\nยังไม่มีบทสนทนา — แสดงสถิติหลังจากได้รับ response แรก\n${sep}\n`;
  }

  const compression = loadCompression();
  const ratio = compression[level] != null ? compression[level] : null;
  const price = priceForModel(model);

  let savings;
  let footer = '';
  if (ratio !== null) {
    const estNormal = Math.round(outputTokens / (1 - ratio));
    const estSaved = estNormal - outputTokens;
    let usdLine = '';
    if (price !== null) {
      const usd = (estSaved / 1_000_000) * price;
      usdLine = `ประหยัด (USD):        ~${formatUsd(usd)}\n`;
      footer = `คำนวณประหยัดจาก benchmarks/ (ค่ากลางต่อ task). ราคาสำหรับ ${model}. ตัวเลขจริงขึ้นกับ task.`;
    } else {
      footer = 'คำนวณประหยัดจาก benchmarks/ (ค่ากลางต่อ task). ตัวเลขจริงขึ้นกับ task.';
    }
    savings = `โทเค็นโดยประมาณ (ไม่ใช้พอดี): ${estNormal.toLocaleString()}\n` +
              `ประหยัดโทเค็น:        ${estSaved.toLocaleString()} (~${Math.round(ratio * 100)}%)\n` +
              usdLine.replace(/\n$/, '');
  } else if (level) {
    savings = `ไม่มี benchmark สำหรับ level '${level}'. รัน \`node benchmarks/run.js --level ${level}\` ก่อน`;
  } else {
    savings = 'พอดีไม่ active ใน session นี้';
  }

  return `\nพอดี Stats\n${sep}\n` +
    (shortPath ? `Session:  ${shortPath}\n` : '') +
    `เทิร์น:    ${turns}\n${sep}\n` +
    `Output tokens:         ${outputTokens.toLocaleString()}\n` +
    `Cache-read tokens:     ${cacheReadTokens.toLocaleString()}\n${sep}\n` +
    `${savings}\n` +
    (footer ? footer + '\n' : '');
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--session-file');
  const sessionFileArg = i !== -1 ? args[i + 1] : null;
  const share = args.includes('--share');
  const all = args.includes('--all');
  const sinceIdx = args.indexOf('--since');
  const sinceArg = sinceIdx !== -1 ? args[sinceIdx + 1] : null;

  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const pordeeDir = process.env.PORDEE_HOME || path.join(os.homedir(), '.pordee');
  const historyPath = path.join(pordeeDir, 'history.jsonl');

  if (all || sinceArg) {
    const sinceMs = parseDuration(sinceArg);
    if (sinceArg && sinceMs === null) {
      process.stderr.write(`pordee-stats: --since takes Nh or Nd (e.g. 7d, 24h), got: ${sinceArg}\n`);
      process.exit(2);
    }
    const agg = aggregateHistory(historyPath, sinceMs);
    process.stdout.write(formatHistory({ ...agg, since: sinceArg || null }));
    return;
  }

  const sessionFile = sessionFileArg || findRecentSession(claudeDir);

  if (!sessionFile) {
    process.stderr.write('pordee-stats: no Claude Code session found.\n');
    process.exit(1);
  }

  const parsed = parseSession(sessionFile);
  const state = getState();
  const level = state.enabled ? state.level : null;

  if (parsed.turns > 0) {
    const { estSavedTokens, estSavedUsd } = deriveSavings({ ...parsed, level });
    const sessionId = path.basename(sessionFile, '.jsonl');
    appendHistory(historyPath, JSON.stringify({
      ts: Date.now(),
      session_id: sessionId,
      level: level || null,
      model: parsed.model || null,
      output_tokens: parsed.outputTokens,
      est_saved_tokens: estSavedTokens,
      est_saved_usd: estSavedUsd,
    }));

    const agg = aggregateHistory(historyPath, null);
    const suffix = agg.estSavedTokens > 0 ? `⚡ ${humanizeTokens(agg.estSavedTokens)}` : '';
    try {
      fs.mkdirSync(pordeeDir, { recursive: true });
      fs.writeFileSync(path.join(pordeeDir, 'statusline-suffix'), suffix);
    } catch {
      // Best-effort
    }
  }

  if (share) {
    process.stdout.write(formatShare({ ...parsed, level }) + '\n');
  } else {
    process.stdout.write(formatStats({ ...parsed, level, sessionPath: sessionFile }));
  }
}

if (require.main === module) main();

module.exports = {
  formatStats, formatShare, formatHistory, aggregateHistory, parseDuration, deriveSavings,
  parseSession, priceForModel, formatUsd, loadCompression, humanizeTokens,
};
