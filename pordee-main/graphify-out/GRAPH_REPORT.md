# Graph Report - pordee-main  (2026-06-14)

## Corpus Check
- Corpus is ~22,623 words - fits in a single context window. You may not need a graph.

## Summary
- 197 nodes · 237 edges · 13 communities (11 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]

## God Nodes (most connected - your core abstractions)
1. `main()` - 12 edges
2. `pordee Claude Code Plugin` - 11 edges
3. `getState()` - 8 edges
4. `pordee-stats.js (Token Usage Reporter)` - 8 edges
5. `runBenchmark()` - 6 edges
6. `formatShare()` - 5 edges
7. `formatStats()` - 5 edges
8. `setState()` - 5 edges
9. `main()` - 5 edges
10. `pordee-mode-tracker.js (UserPromptSubmit Hook)` - 5 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `getState()`  [EXTRACTED]
  hooks/pordee-stats.js → hooks/pordee-config.js
- `pordee Claude Code Plugin` --configured_by--> `.claude-plugin/plugin.json (Plugin Manifest)`  [EXTRACTED]
  pordee-main/README.md → pordee-main/docs/superpowers/specs/2026-05-07-pordee-design.md
- `pordee Claude Code Plugin` --published_via--> `.claude-plugin/marketplace.json (Marketplace Manifest)`  [EXTRACTED]
  pordee-main/README.md → pordee-main/docs/superpowers/specs/2026-05-07-pordee-design.md
- `pordee Claude Code Plugin` --uses_for_testing--> `Node.js Built-in Test Runner (node --test)`  [EXTRACTED]
  pordee-main/README.md → pordee-main/docs/superpowers/plans/2026-05-07-pordee-mvp.md
- `pordee-config.js (State Helper)` --implements--> `Atomic State Writes (write-then-rename pattern)`  [EXTRACTED]
  pordee-main/docs/superpowers/plans/2026-05-07-pordee-mvp.md → pordee-main/docs/superpowers/specs/2026-05-07-pordee-design.md

## Hyperedges (group relationships)
- **pordee Token Compression Pipeline** — pordee_sessionstart_hook, pordee_userpromptsubmit_hook, pordee_state_json, pordee_skill_md [INFERRED 0.95]
- **pordee Stats + Benchmark Data Pipeline** — pordee_benchmark_runner, pordee_compression_json, pordee_stats_reporter [EXTRACTED 1.00]
- **pordee Plugin Distribution Stack** — pordee_plugin_json, pordee_marketplace_json, pordee_plugin [EXTRACTED 1.00]

## Communities (13 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (26): { getState }, state, DEFAULT_STATE, ERROR_LOG_PATH, fs, getState(), logError(), os (+18 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (29): caveman (Inspiration Plugin by JuliusBrussee), Atomic State Writes (write-then-rename pattern), Auto-Clarity (Temporarily Disable Compression), Boundaries (Code/Commits/Errors Stay Normal), Adaptation of caveman-stats.js for pordee, Skip Trigger Detection Inside Code Fences, Thai Compression Rules (Drop List + Terse Swaps), pordee-config.js (State Helper) (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (18): assert, entry, { execFileSync }, { formatStats }, fs, histPath, { humanizeTokens }, lines (+10 more)

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (19): assert, compressionPath, data, env, { execFileSync }, fs, full, lite (+11 more)

### Community 4 - "Community 4"
Cohesion: 0.19
Nodes (20): aggregateHistory(), appendHistory(), deriveSavings(), findRecentSession(), formatHistory(), formatShare(), formatStats(), formatUsd() (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (11): assert, fs, home, os, parsed, path, result, { spawnSync } (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (10): assert, cases, fs, home, os, path, { spawnSync }, state (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (11): args, data, { execFileSync }, { getState, setState, logError }, parseTrigger(), path, prompt, state (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (9): ACTIVATE_PATH, assert, fs, home, os, path, result, { spawnSync } (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (11): callAPI(), fs, loadPrompts(), main(), makeSystemPrompt(), mean(), median(), path (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.5
Nodes (4): benchmarks/prompts.json (8 Thai Dev Prompts), benchmarks/run.js (API Benchmark Runner), benchmarks/compression.json (Median Ratio Lookup), Median Compression Ratio (data-driven from benchmarks)

## Knowledge Gaps
- **124 isolated node(s):** `{ test }`, `assert`, `fs`, `os`, `path` (+119 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getState()` connect `Community 0` to `Community 4`, `Community 7`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `pordee-stats.js (Token Usage Reporter)` connect `Community 1` to `Community 10`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `{ test }`, `assert`, `fs` to the rest of the system?**
  _124 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._