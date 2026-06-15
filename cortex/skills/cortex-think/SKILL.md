---
name: cortex-think
description: Reason through a hard problem with cortex's full cognition — the thinking disciplines + นิวรณ์5 self-observation, any prior lessons cortex holds on it, and a warning if it's a problem hit before. Use when the user types `/cortex-think`, or asks to "think this through", "reason about X carefully", "help me work through …", "what's the right way to approach …", or is stuck and wants a structured way in.
---

# cortex-think

On-demand deep reasoning. The standing cognition prime steers every session passively; this
skill *focuses* it onto ONE problem and pulls in any memory relevant to it. Run the script with
the user's problem, then reason through it WITH the returned scaffold — treat it as a thinking
aid for yourself, not output to paste back verbatim.

## Run

Pass the problem / question as one quoted argument:

```bash
bun "${CLAUDE_PLUGIN_ROOT}/scripts/cortex-think.ts" "<the problem or question in a sentence>"
```

(If `${CLAUDE_PLUGIN_ROOT}` is unset, the script is `scripts/cortex-think.ts` inside the
cortex plugin directory.)

## Using the result

- The **discipline + นิวรณ์5 block** is a checklist for your own reasoning — frame the root,
  verify claims against reality, watch for thrashing / distraction. It is not text to relay.
- A **⚠️ chronic-recurrence flag** means cortex has hit this before: do NOT loop the same fix —
  confirm the prior fix actually held, or change approach.
- **Recalled lessons / knowledge** carry a freshness caveat — treat them as prior context to
  verify against the current state, not as current fact (older items especially).
- Then give the user your actual reasoned answer, *shaped by* (not quoting) the scaffold, in
  their language.
