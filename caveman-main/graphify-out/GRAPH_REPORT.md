# Graph Report - caveman-main  (2026-06-14)

## Corpus Check
- 116 files · ~74,923 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 649 nodes · 929 edges · 43 communities (35 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.79)
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
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]

## God Nodes (most connected - your core abstractions)
1. `main()` - 18 edges
2. `main()` - 15 edges
3. `caveman` - 15 edges
4. `detectMatch()` - 10 edges
5. `validate()` - 10 edges
6. `ensure()` - 10 edges
7. `main()` - 10 edges
8. `runSpawn()` - 9 edges
9. `ValidationResult` - 9 edges
10. `getDefaultMode()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `downloadTo()` --calls--> `require`  [INFERRED]
  bin/install.js → tests/installer/unit.settings.test.mjs
- `TestExtractInlineCodes` --uses--> `ValidationResult`  [INFERRED]
  tests/test_validate_inline.py → skills/caveman-compress/scripts/validate.py
- `TestValidateInlineCodes` --uses--> `ValidationResult`  [INFERRED]
  tests/test_validate_inline.py → skills/caveman-compress/scripts/validate.py
- `TestValidateIntegration` --uses--> `ValidationResult`  [INFERRED]
  tests/test_validate_inline.py → skills/caveman-compress/scripts/validate.py
- `loadOpenclawHelper()` --calls--> `require`  [INFERRED]
  src/tools/caveman-init.js → tests/installer/unit.settings.test.mjs

## Communities (43 total, 8 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (56): absoluteNodePath(), captureSpawn(), checkNodeVersion(), checkWslWindowsNode(), child_process, copyDirRecursive(), crypto, cursorExtPresent() (+48 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (39): Atlas Cloud (sponsor), benchmarks/ (real token measurements), cavegemma (Gemma 4 31B fine-tuned), cavekit (spec-driven build loop), caveman-activate.js SessionStart hook, src/hooks/caveman-activate.js (SessionStart hook), .caveman-active (flag file), caveman-code (terminal coding agent) (+31 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (23): benchmark_pair(), count_tokens(), main(), print_table(), count_bullets(), extract_code_blocks(), extract_headings(), extract_inline_codes() (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (26): RuntimeError, main(), print_usage(), backup_dir_for(), build_compress_prompt(), build_fix_prompt(), call_claude(), compress_file() (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (27): args, cleanPath, dir, env, helper, HERE, hooks, initScript (+19 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (27): after, afterBytes, agentsBody, agentsMd, beforeBytes, cfg, cfgPath, env (+19 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (27): { appendFlag }, assert, claudeDir, entry, env, { execFileSync }, { findCompressedPairs }, { formatStats } (+19 more)

### Community 7 - "Community 7"
Cohesion: 0.1
Nodes (23): a, b, dir, n, out, p, raw, removed (+15 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (23): appendFlag(), readFlag(), readHistory(), aggregateHistory(), COMPRESSION, deriveSavings(), findCompressedPairs(), findRecentSession() (+15 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (17): compress(), compressDescriptionsInPlace(), FILLERS, HEDGES, LEADERS, PLEASANTRIES, PROTECTED_PATTERNS, withProtectedSegments() (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (22): AGENTS.md root autodiscovery file, auto-clarity: drop caveman for security/destructive/ambiguous output, cavecrew-builder agent, cavecrew decision guide, cavecrew-investigator agent, cavecrew README, cavecrew-reviewer agent, cavecrew SKILL.md (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (16): after, agents, assert, cline, copilot, cursor, dir, { execFileSync } (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.11
Nodes (18): activeMode, argv, data, { execFileSync }, flagPath, fs, { getDefaultMode, safeWriteFlag, readFlag, VALID_MODES }, INDEPENDENT_MODES (+10 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (17): assert, decoyFile, flagDir, flagPath, fs, lines, os, path (+9 more)

### Community 14 - "Community 14"
Cohesion: 0.2
Nodes (16): appendBootstrapToSoul(), frontmatterHasKey(), fs, installOpenclaw(), loadBootstrapSnippet(), loadSkillBody(), mergeOpenclawFrontmatter(), os (+8 more)

### Community 15 - "Community 15"
Cohesion: 0.15
Nodes (14): validateHookFields() (settings.json guard), addCommandHook(), claudeConfigDir(), crypto, fs, hasCavemanHook(), MANAGED_HOOK_BASENAMES, os (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.3
Nodes (15): CheckFailure, ensure(), _frontmatter_description(), load_compress_modules(), read_json(), run(), section(), shell_path() (+7 more)

### Community 17 - "Community 17"
Cohesion: 0.16
Nodes (16): Anthropic Python SDK, benchmarks requirements.txt, caveman-compress README, caveman-compress SECURITY.md, fixture: claude-md-preferences.md (compressed), fixture: claude-md-preferences.original.md, fixture: claude-md-project.md (compressed), fixture: claude-md-project.original.md (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (13): bodyIn, bodyOut, dest, fm, HERE, installed, out, REPO_ROOT (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.26
Nodes (13): call_api(), compute_stats(), dry_run(), format_prompt_label(), format_table(), load_caveman_system(), load_prompts(), main() (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (11): assert, { compress, compressDescriptionsInPlace }, { compressed }, { compressed, before, after }, { getSpawnOptions }, obj, opts, path (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.15
Nodes (12): body, filtered, flagPath, fs, { getDefaultMode, safeWriteFlag }, INDEPENDENT_MODES, mode, os (+4 more)

### Community 22 - "Community 22"
Cohesion: 0.21
Nodes (11): agents/cavecrew-builder.md, agents/cavecrew-investigator.md, agents/cavecrew-reviewer.md, .github/workflows/sync-skill.yml, auto-clarity rule (drop to normal prose for warnings/confirmations), plugins/caveman/ (Claude Code plugin distribution), skills/cavecrew/SKILL.md, skills/caveman/SKILL.md (+3 more)

### Community 23 - "Community 23"
Cohesion: 0.2
Nodes (8): safeWriteFlag(), applyModeChange(), CavemanPlugin(), config, flagPath, handleSessionCreated(), here, INDEPENDENT_MODES

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (10): findRepoConfigPath(), fs, getConfigDir(), getConfigPath(), getDefaultMode(), os, path, readModeFromConfigFile() (+2 more)

### Community 25 - "Community 25"
Cohesion: 0.2
Nodes (8): assert, fs, { getDefaultMode, findRepoConfigPath }, nested, os, path, real, tmpHome

### Community 27 - "Community 27"
Cohesion: 0.25
Nodes (6): before, cfg, fake, HERE, INSTALLER, r

### Community 29 - "Community 29"
Cohesion: 0.53
Nodes (5): count(), fmt_pct(), main(), Read evals/snapshots/results.json (produced by llm_run.py) and report real token, stats()

### Community 30 - "Community 30"
Cohesion: 0.33
Nodes (4): collapsed, HERE, INSTALLER, r

### Community 31 - "Community 31"
Cohesion: 0.6
Nodes (4): claude_version(), main(), Run each prompt through Claude Code in three conditions and snapshot the real LL, run_claude()

### Community 32 - "Community 32"
Cohesion: 0.67
Nodes (3): count(), main(), Generate a boxplot showing the distribution of token compression per skill, comp

## Knowledge Gaps
- **305 isolated node(s):** `Read evals/snapshots/results.json (produced by llm_run.py) and report real token`, `Generate a boxplot showing the distribution of token compression per skill, comp`, `Run each prompt through Claude Code in three conditions and snapshot the real LL`, `fs`, `os` (+300 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `settings.json (Claude Code config)` connect `Community 1` to `Community 15`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `caveman-mode-tracker.js UserPromptSubmit hook` connect `Community 1` to `Community 10`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `Read evals/snapshots/results.json (produced by llm_run.py) and report real token`, `Generate a boxplot showing the distribution of token compression per skill, comp`, `Run each prompt through Claude Code in three conditions and snapshot the real LL` to the rest of the system?**
  _305 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._