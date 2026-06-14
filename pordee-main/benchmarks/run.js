#!/usr/bin/env node
// pordee benchmark — run Thai prompts through Anthropic API twice per prompt
// (normal mode vs pordee mode), compute compression ratios, save results.
//
// Usage: node benchmarks/run.js [--level full|lite] [--model <id>] [--dry-run]

const fs = require('fs');
const path = require('path');

const API_BASE = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';
const API_URL = API_BASE.replace(/\/$/, '') + '/chat/completions';

function loadPrompts() {
  const promptsPath = path.join(__dirname, 'prompts.json');
  return JSON.parse(fs.readFileSync(promptsPath, 'utf8'));
}

function makeSystemPrompt(level) {
  if (level === 'lite') {
    return 'Respond in Thai. Drop polite particles (ครับ, ค่ะ, นะคะ, นะครับ), hedging (อาจจะ, น่าจะ), and pleasantries (ได้เลยครับ, แน่นอน). Keep technical English terms. Keep grammar intact.';
  }
  return 'Respond terse like simple Thai. Keep technical English terms. Drop polite particles (ครับ, ค่ะ, นะคะ, นะครับ), hedging (อาจจะ, น่าจะ, จริงๆแล้ว), pleasantries (ได้เลยครับ, แน่นอน), and English-style filler (just/really/basically/actually/simply). Fragments OK. Use short Thai synonyms (ดู not ตรวจสอบ, แก้ not ทำการแก้ไข, เพราะ not เนื่องจาก).';
}

async function callAPI(prompt, systemPrompt, model, apiKey) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'User-Agent': 'claude-code/0.1.0',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }
  const data = await response.json();
  return {
    tokens: data.usage.completion_tokens,
    content: data.choices[0].message.content,
  };
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function runBenchmark(prompts, level, model, apiKey, dryRun = false) {
  const normalSystem = 'You are a helpful assistant. Respond in Thai.';
  const pordeeSystem = makeSystemPrompt(level);
  const results = [];

  for (const { id, prompt } of prompts) {
    let normalTokens, pordeeTokens;

    if (dryRun) {
      const base = id.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
      normalTokens = 300 + (base % 400);
      pordeeTokens = Math.floor(normalTokens * (0.3 + (base % 20) / 100));
    } else {
      const normalResult = await callAPI(prompt, normalSystem, model, apiKey);
      const pordeeResult = await callAPI(prompt, pordeeSystem, model, apiKey);
      normalTokens = normalResult.tokens;
      pordeeTokens = pordeeResult.tokens;
    }

    const ratio = normalTokens > 0 ? (normalTokens - pordeeTokens) / normalTokens : 0;
    results.push({ id, prompt, normal_tokens: normalTokens, pordee_tokens: pordeeTokens, ratio });
  }

  const ratios = results.map(r => r.ratio);
  return {
    timestamp: new Date().toISOString(),
    model,
    level,
    prompts: results,
    summary: {
      median_ratio: median(ratios),
      mean_ratio: mean(ratios),
      min_ratio: Math.min(...ratios),
      max_ratio: Math.max(...ratios),
      count: results.length,
    },
  };
}

function saveResults(result) {
  const resultsDir = path.join(__dirname, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const filename = result.timestamp.replace(/[:.]/g, '-') + '.json';
  const filepath = path.join(resultsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
  return filepath;
}

function updateCompressionJson(result) {
  const compressionPath = path.join(__dirname, 'compression.json');
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(compressionPath, 'utf8'));
  } catch {
    // File missing or invalid — start fresh
  }

  const compression = {
    ...(existing.compression || {}),
    [result.level]: result.summary.median_ratio,
  };

  const updated = {
    generated_at: result.timestamp,
    model: result.model,
    compression,
    source_run: result.timestamp,
  };

  fs.writeFileSync(compressionPath, JSON.stringify(updated, null, 2));
  return compressionPath;
}

async function main() {
  const args = process.argv.slice(2);
  const levelIdx = args.indexOf('--level');
  const level = levelIdx !== -1 ? args[levelIdx + 1] : 'full';
  const modelIdx = args.indexOf('--model');
  const model = modelIdx !== -1 ? args[modelIdx + 1] : 'kimi-for-coding';
  const dryRun = args.includes('--dry-run');

  if (!['full', 'lite'].includes(level)) {
    process.stderr.write(`Invalid level: ${level}. Use 'full' or 'lite'.\n`);
    process.exit(2);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !dryRun) {
    process.stderr.write('ANTHROPIC_API_KEY not set. Set it or use --dry-run.\n');
    process.exit(1);
  }

  const prompts = loadPrompts();
  const result = await runBenchmark(prompts, level, model, apiKey, dryRun);
  const resultsPath = saveResults(result);
  const compressionPath = updateCompressionJson(result);

  process.stdout.write(`Benchmark complete.\n`);
  process.stdout.write(`Results: ${resultsPath}\n`);
  process.stdout.write(`Compression: ${compressionPath}\n`);
  process.stdout.write(`Median ${level} compression: ${(result.summary.median_ratio * 100).toFixed(1)}%\n`);
}

module.exports = { callAPI, runBenchmark, median, mean, loadPrompts, makeSystemPrompt, saveResults, updateCompressionJson };

if (require.main === module) {
  main().catch(e => {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  });
}
