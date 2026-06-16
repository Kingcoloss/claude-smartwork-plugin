#!/usr/bin/env bun
/**
 * cortex MCP server (Sprint 4 / S4-T8) — the PULL surface for memory.
 *
 * The hooks PUSH memory into the lifecycle (T5 recall on every prompt, T6 consolidate at
 * session end); this server lets Claude PULL it on demand mid-task. Three tools, each a thin
 * wrapper over `lib/mcp.ts` (the tested logic) — open the store per call, run, close (mirrors
 * the CLI lifecycle; WAL keeps the concurrent hook processes reader-safe). Wired via the
 * plugin's `.mcp.json`. Optional layer: if Bun/sqlite is absent the tool returns a plain note,
 * never throws (cooperate, not replace).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getConfig } from '../lib/config.ts';
import { openMemory, closeMemory, type MemoryHandle } from '../lib/memory.ts';
import { recallTool, commitTool, wikiSearchTool } from '../lib/mcp.ts';

const UNAVAILABLE = 'cortex memory: unavailable (disabled or no sqlite)';

/** Open the store, run fn, always close — one short-lived handle per tool call (mirrors the CLIs). */
async function withMemory(fn: (h: MemoryHandle) => Promise<string>): Promise<string> {
  const h = openMemory({ cfg: getConfig() });
  if (!h) return UNAVAILABLE;
  try { return await fn(h); } finally { closeMemory(h); }
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

/** Build the server with its three tools registered — separated from connect() so it stays testable. */
export function buildServer(): McpServer {
  const server = new McpServer({ name: 'cortex-memory', version: '0.1.3' });

  server.registerTool('memory_recall', {
    description:
      'Recall cortex memory relevant to a query: past lessons (Core Memory) + distilled knowledge ' +
      '(LLM-Wiki). Returns a freshness-caveated block — treat it as prior context to verify against ' +
      'the present, not as current truth.',
    inputSchema: { query: z.string().describe('what to recall — the task, error, or concept at hand') },
  }, async ({ query }) => text(await withMemory((h) => recallTool(h, query))));

  server.registerTool('memory_commit', {
    description:
      'Commit one durable memory. A lesson (Core Memory / อริยสัจ4): pass "lesson" (the problem), ' +
      'optionally cause/resolved/fix — dedups by signature, bumps a recurrence counter. A knowledge ' +
      'page (LLM-Wiki): pass "title" + "body", optionally "tags" — upserts by title.',
    inputSchema: {
      lesson: z.string().optional().describe('the problem/error to remember as a lesson (Core Memory)'),
      cause: z.string().optional().describe('root cause of the lesson'),
      resolved: z.string().optional().describe('the resolved/correct state'),
      fix: z.string().optional().describe('the fix path that resolved it'),
      title: z.string().optional().describe('concept name for an LLM-Wiki page'),
      body: z.string().optional().describe('the page content'),
      tags: z.string().optional().describe('comma-separated tags for the page'),
    },
  }, async (input) => text(await withMemory((h) => commitTool(h, input))));

  server.registerTool('wiki_search', {
    description: 'Search the cortex LLM-Wiki knowledge base by query, or list the full page catalog when no query is given.',
    inputSchema: { query: z.string().optional().describe('concept to search for; omit to list the whole catalog') },
  }, async ({ query }) => text(await withMemory((h) => wikiSearchTool(h, query))));

  return server;
}

if (import.meta.main) {
  await buildServer().connect(new StdioServerTransport());
}
