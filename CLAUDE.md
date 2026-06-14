# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

`claude-smartwork-plugin` is a **public Claude Code plugin marketplace**. It is a *catalog repo* that hosts multiple plugins (each bundling its own skills and hooks) and exposes them for others to install. Theme/goal across everything published here: make Claude Code **more token-efficient** and improve **how it reasons about a task** (planning, structuring work, deciding what to load into context).

This is a **public** repo — anything committed is consumed by strangers via `/plugin install`. Two consequences flow from that:
- Every feature is judged against the theme: does it cut tokens, or improve how work is approached? If a change does neither, it likely belongs in a different repo.
- Treat user-facing metadata as a product surface: plugin `name`/`description`/`keywords` drive discovery, versions must move deliberately (people pin and upgrade against them), and the README must tell an outside user how to add the marketplace and install a plugin — not just describe internals.

## Current state

The marketplace is scaffolded but holds **no plugins yet**: `.claude-plugin/marketplace.json` exists with an empty `plugins: []`, and `LICENSE` (MIT) is in place. There is still **no build, test, or lint tooling and no `package.json`.** Do not invent or assume such commands exist — if you need one, add it deliberately and document it here.

The marketplace identifier is **`claude-smartwork`** (the `name` in `marketplace.json`) — this is the public `@marketplace` suffix users type in `/plugin install <plugin>@claude-smartwork`, so do not rename it casually. Adding the first plugin = create a `<plugin-name>/` dir with its own `.claude-plugin/plugin.json`, then append an entry to `plugins[]` with `"source": "./<plugin-name>"`.

Directories that look like project code but are **not** (they belong to external tooling/plugins, and most are gitignored):
- `.remember/` — state for the `remember` plugin (session memory, logs).
- `.code-review-graph/` — local SQLite knowledge graph; the `code-review-graph` MCP server is **disabled** in this repo (see `.claude/settings.local.json`).
- `.github/instructions/codacy.instructions.md` — Codacy's VS Code AI rules, gitignored; not authoritative for Claude Code's behavior here.

## Marketplace layout to build toward

Two levels of structure. The **marketplace manifest** lives at the repo root and is the catalog; each **plugin** is a self-contained subdirectory it points at.

```
.claude-plugin/marketplace.json   # catalog: name, owner, and the plugins[] list
<plugin-a>/                        # one directory per published plugin
  .claude-plugin/plugin.json       #   plugin manifest (name, version, description)
  commands/*.md                    #   each .md → /<filename>
  skills/<name>/SKILL.md           #   one folder per skill; frontmatter (name, description) + body
  agents/*.md                      #   subagent definitions
  hooks/hooks.json                 #   hook wiring (SessionStart, PostToolUse, …)
<plugin-b>/ ...
```

- `marketplace.json` requires `name` + a `plugins[]` array; each entry needs at least `name` and `source` (a relative path like `"./plugin-a"` for plugins hosted in this same repo). Keep `description`/`version` accurate — they are what users see before installing.
- Plugin components (`commands/`, `skills/`, `agents/`, `hooks/`) are **auto-discovered** — there is no central registry inside a plugin to edit; adding the file is enough.
- In hook commands and scripts, reference a plugin's own files via `${CLAUDE_PLUGIN_ROOT}` rather than hardcoded paths, so the plugin works wherever it is installed.

When deciding *which* component type to use: a **skill** captures reusable know-how/process Claude loads on demand; a **command** is a user-triggered entry point (`/name`); a **hook** automates behavior the harness runs deterministically (Claude cannot fulfill "always do X after Y" via instructions alone — it needs a hook).

Users consume this marketplace with `/plugin marketplace add <owner/repo>` then `/plugin install <plugin-name>@<marketplace-name>`. The marketplace `name` and each plugin `name` are the public identifiers in that second command, so rename them only with care.

## Environment specifics

- `.claude/settings.local.json` runs this repo in **`bypassPermissions` mode** — tool calls are not gated by prompts here. Be correspondingly careful with destructive or outward-facing actions.
- The `code-review-graph` MCP server is **disabled** for this repo, so the graph-first workflow described in the global `~/CLAUDE.md` does not apply — use Grep/Glob/Read directly.
