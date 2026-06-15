---
name: cortex-recall
description: Recall what cortex has learned — past lessons (Core Memory) and distilled knowledge (LLM-Wiki) — relevant to a topic, or list the whole knowledge catalog. Use when the user types `/cortex-recall`, or asks in words like "have I hit this before?", "what do I know about X?", "what did we learn about …", "show my notes/lessons/knowledge base", or "what's in cortex's memory".
---

# cortex-recall

On-demand recall from cortex's long-term memory. (The recall hook already injects
relevant memory automatically each turn — this skill is for when the user *explicitly*
asks what's stored.) Pick the mode from what the user wants, run the script, and relay
its output in the user's language.

## Run

For a topic / "have I seen this?" query — pass the user's topic as one quoted argument:

```bash
bun "${CLAUDE_PLUGIN_ROOT}/scripts/cortex-recall.ts" "<the topic or error in a few words>"
```

For "show everything / my knowledge base / catalog" — list all LLM-Wiki pages:

```bash
bun "${CLAUDE_PLUGIN_ROOT}/scripts/cortex-recall.ts" --index
```

(If `${CLAUDE_PLUGIN_ROOT}` is unset, the script is `scripts/cortex-recall.ts` inside the
cortex plugin directory.)

## Relaying the result

- The output already carries a **freshness caveat** (`may be STALE — verify against
  current state`). Honor it: present recalled lessons/knowledge as *prior context to
  verify*, not as current fact — especially older items (the age is shown per item).
- `seen ×N` on a lesson = how often that problem recurred; a high count is worth flagging
  ("this has bitten us repeatedly").
- If the script prints `nothing relevant` or `(empty)`, say so plainly — don't invent
  memory. cortex recalls only what was actually stored.
