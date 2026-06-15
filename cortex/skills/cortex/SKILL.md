---
name: cortex
description: Control the cortex plugin's terse-output (Expression) mode and view its status / token savings. Use when the user types `/cortex`, `/cortex on|off|lite|full|ultra`, `/cortex status`, or asks in words to turn cortex on/off, change its terseness level, or see how many tokens it has saved.
---

# cortex control

`/cortex` adjusts the **Expression** faculty (terse output) and reports cortex's
state. Read the argument the user passed and act per the table:

| Arg | Meaning | What you do |
|-----|---------|-------------|
| `off` / `stop` | disable terse output | The UserPromptSubmit hook **already wrote the runtime flag** before you saw this prompt. Do not edit any file — just confirm in one line: `cortex terse output → off`. |
| `lite` / `full` / `ultra` | set terseness level | Hook already wrote the flag. Confirm: `cortex terse mode → <level>`. |
| `on` / *(no arg)* | back to the configured default | Hook already cleared the override. Confirm: `cortex terse output → config default`. |
| `status` / `stats` | show state + savings | Run the status script (below) and relay its output. This changes **nothing**. |

## Status

For `status` / `stats`, run:

```bash
bun "${CLAUDE_PLUGIN_ROOT}/scripts/cortex-status.ts"
```

(If `${CLAUDE_PLUGIN_ROOT}` is unset, the script is `scripts/cortex-status.ts`
inside the cortex plugin directory.) Relay the output compactly in the user's
language. The `savings` line is cumulative Perception compression — chars saved ≈
tokens saved; with a slow local ollama model it is often `0`, which is **expected**
(compression stays inert under the synchronous cap), not a bug.

## Notes
- on/off/level changes take effect from the **next** prompt — the hooks re-read
  the flag each turn.
- Never announce terse mode in normal replies; this skill is the only place to
  discuss it.
- cortex cooperates with native Claude Code: turning it off just stops the style
  nudges — nothing native changes.
