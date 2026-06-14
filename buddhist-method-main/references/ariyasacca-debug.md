# The Four Noble Truths as a Debugging Frame

When a problem is hard, fuzzy, or you don't know how to start, use the Four Noble Truths as a structured frame. Each truth has a function (*kicca*) — what you actually do at that step. The discipline is doing them in order.

| Truth | What it is | Function (*kicca*) |
|-------|------------|-------------------|
| Dukkha (ทุกข์) | The problem | *Pariññā* — fully understand it |
| Samudaya (สมุทัย) | The cause | *Pahāna* — remove it |
| Nirodha (นิโรธ) | Cessation — "this can be solved" | *Sacchikiriyā* — confirm it |
| Magga (มรรค) | The path | *Bhāvanā* — develop, follow it |

## Step 1: Pariññā — fully understand the problem

Most debugging mistakes start here: rushing to fix before understanding. "Fully understand" means:

- What exactly is broken? Reproduce it. Pin down inputs and observed outputs.
- What is the smallest case that shows the problem?
- What changed recently? (Not "what *might* have changed" — verify.)
- What is the user actually trying to do, vs. what they reported?

Don't proceed until you can describe the problem in one or two sentences without hedging.

**Bad sign:** you find yourself proposing solutions before the problem is one sentence.

## Step 2: Pahāna — remove the cause, not the symptom

Now find the cause (using *yoniso manasikāra* — root attention) and *remove* it. Don't manage it, don't catch it, don't work around it. Removal looks like:

- Fixing the bug at its source.
- Removing the assumption that produced the broken state.
- Refactoring the structure that made the bug expressible at all.

If you can't remove the cause (it's in third-party code, in the platform, etc.), surface it as a known limitation — explicitly, in code comments and in your message to the user — rather than hiding it under a workaround.

## Step 3: Sacchikiriyā — confirm the problem is gone

Verify the cessation. The bug fix is not done when you stop seeing the symptom — it's done when you can produce evidence the cause is gone:

- The original failing case now passes.
- A regression test would catch the bug if it reappeared.
- You can articulate *why* the change removes the cause.

If you cannot articulate the third one, you may have masked the symptom rather than removed the cause. Loop back to step 2.

## Step 4: Bhāvanā — develop the practice

Once it's fixed, generalize:

- Is there a class of similar bugs? Sweep for them.
- Should there be a test, a lint rule, a type, a guard?
- What change to your habits would have caught this earlier?

*Bhāvanā* ("development") is the function that prevents the next instance of the same kind of problem.

## When to use the full frame vs. just yoniso

For a small, well-understood bug, *yoniso* + *pahāna* alone suffice — find the cause and remove it. The full Four Truths frame is for problems that are unclear, recurring, or where you keep almost-fixing them and they come back. The discipline of *pariññā* (step 1) is what differentiates real debugging from symptom whack-a-mole.
