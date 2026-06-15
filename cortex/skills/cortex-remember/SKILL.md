---
name: cortex-remember
description: Save something to cortex's long-term memory on purpose — either a lesson (a problem and how it was solved) or a knowledge page (a reusable concept). Use when the user types `/cortex-remember`, or says "remember this", "save this lesson", "note that …", "don't let me make this mistake again", or "add this to the knowledge base".
---

# cortex-remember

On-demand write to cortex's long-term memory. (The consolidation hook already distils
each session automatically at its end — this skill is for when the user wants to capture
*one specific thing now*.) Decide which of the two shapes fits, extract the fields from
what the user said, and run the script.

## Choose the shape

- **Lesson** (Core Memory / อริยสัจ4) — a mistake, bug, or problem and its resolution.
  Use when the user is recording something that went wrong and how to avoid/fix it.
  Map: the problem → `--lesson`, the root cause → `--cause`, the resolved state →
  `--resolved`, the fix/path → `--fix`. Only `--lesson` is required.

- **Page** (LLM-Wiki) — a reusable concept, definition, pattern, or how-to worth keeping.
  Use when the user is recording knowledge, not a failure. Map: a short concept name →
  `--page`, the content → `--body`, optional comma tags → `--tags`. Both required.

## Run

```bash
# a lesson
bun "${CLAUDE_PLUGIN_ROOT}/scripts/cortex-remember.ts" --lesson "<problem>" --cause "<root cause>" --fix "<the fix>"

# a knowledge page
bun "${CLAUDE_PLUGIN_ROOT}/scripts/cortex-remember.ts" --page "<concept name>" --body "<the knowledge>" --tags "a,b"
```

(If `${CLAUDE_PLUGIN_ROOT}` is unset, the script is `scripts/cortex-remember.ts` inside the
cortex plugin directory.) Quote every value; pass only the fields the user actually gave.

## Confirming

- Relay the script's one-line confirmation tersely in the user's language.
- A lesson may come back as **`recurrence — hits bumped`**: that means cortex already had
  this problem and just counted it again (it dedups by signature, never duplicates). A page
  may come back **`updated`**: an existing same-title page was refreshed (one page per concept).
- If unsure whether the user means a lesson or a page, ask one short question rather than guessing.
