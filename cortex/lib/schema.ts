/**
 * Memory schema — the long-term store's data model (Sprint 4 / S4-T1).
 *
 * Three human-brain memory kinds on one bun:sqlite file:
 *   • episodic    — session events (what happened, when)
 *   • semantic    — LLM-Wiki: distilled, reusable concepts          (writers: S4-T4)
 *   • core_memory — อริยสัจ4 error→cause→fix→path, anti-repeat ledger (writers: S4-T3)
 *
 * Storage layering (D4/D10): regular tables are typed via drizzle-orm; the SEARCH
 * surfaces — FTS5 (keyword) and vec0 (semantic KNN) — are SQLite *virtual* tables
 * drizzle can't model, so they're created with raw SQL here. vec0 is OPTIONAL:
 * Bun's bundled SQLite ships with extension-loading OFF, so sqlite-vec only loads
 * when a real libsqlite3 is found (Homebrew etc.). No vec → recall degrades to
 * FTS-only, never breaks (cooperate, not replace).
 *
 * Embedding dims are model-bound (nomic=768, qwen3=4096), so the vec table can't be
 * created until the first real embedding reveals the width; lib/memory.ts learns it
 * then, persists it in `meta`, and creates the vec table.
 *
 * Foundation scope: all 3 regular tables are the declared data model and exist now.
 * episodic (T2) + core_memory (T3) have their FTS5/vec0 surfaces built here; semantic's
 * are created alongside its write path in T4, not before.
 */
import { existsSync } from 'node:fs';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { Database } from 'bun:sqlite';

export const SCHEMA_VERSION = 1;

// ── regular tables (typed access via drizzle) ──────────────────────────────
export const episodic = sqliteTable('episodic', {
  id: text('id').primaryKey(),                 // ULID (sortable by creation time)
  sessionId: text('session_id').notNull(),
  ts: integer('ts').notNull(),                 // epoch ms
  kind: text('kind').notNull(),                // user | assistant | tool | note | decision
  content: text('content').notNull(),
  meta: text('meta'),                          // optional JSON blob
});

export const semantic = sqliteTable('semantic', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  tags: text('tags'),                          // optional comma list
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const coreMemory = sqliteTable('core_memory', {
  id: text('id').primaryKey(),
  signature: text('signature').notNull().unique(), // dedup key (anti-repeat)
  dukkha: text('dukkha').notNull(),            // ทุกข์ — the error/problem
  samudaya: text('samudaya'),                  // สมุทัย — root cause
  nirodha: text('nirodha'),                    // นิโรธ — the resolved state
  magga: text('magga'),                        // มรรค — the fix path
  hits: integer('hits').notNull(),             // times re-encountered (anti-repeat signal)
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ── libsqlite3 discovery (sqlite-vec needs a full SQLite, not Bun's bundled) ─
/** Candidate full-featured libsqlite3 paths; env override wins. */
const SQLITE_LIB_CANDIDATES = [
  process.env.CORTEX_SQLITE_LIB,                     // explicit override
  '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib',  // Homebrew (Apple Silicon)
  '/usr/local/opt/sqlite/lib/libsqlite3.dylib',     // Homebrew (Intel)
  '/usr/lib/x86_64-linux-gnu/libsqlite3.so.0',      // Debian/Ubuntu
  '/usr/lib/libsqlite3.so.0',                       // generic Linux
];

/** First existing candidate libsqlite3, or null (→ FTS-only mode). */
export function findSqliteLib(): string | null {
  for (const p of SQLITE_LIB_CANDIDATES) {
    try {
      if (p && existsSync(p)) return p;
    } catch {}
  }
  return null;
}

// ── virtual-table DDL (raw SQL — drizzle can't model FTS5/vec0) ─────────────
/** Create regular tables + episodic FTS5 mirror. Idempotent. */
export function initSchema(db: Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS episodic (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, ts INTEGER NOT NULL,
    kind TEXT NOT NULL, content TEXT NOT NULL, meta TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS semantic (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, tags TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS core_memory (
    id TEXT PRIMARY KEY, signature TEXT NOT NULL UNIQUE,
    dukkha TEXT NOT NULL, samudaya TEXT, nirodha TEXT, magga TEXT,
    hits INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS episodic_fts USING fts5(id UNINDEXED, content)`);
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS core_fts USING fts5(id UNINDEXED, dukkha, samudaya, nirodha, magga)`);
}

/** Create the vec0 tables for a known embedding width. Idempotent; no-op if width invalid.
 *  episodic + core share the width (one embed model → one dims). */
export function initVecTable(db: Database, dims: number): void {
  if (!Number.isInteger(dims) || dims <= 0) return;
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS episodic_vec USING vec0(id TEXT PRIMARY KEY, embedding float[${dims}])`);
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS core_vec USING vec0(id TEXT PRIMARY KEY, embedding float[${dims}])`);
}
