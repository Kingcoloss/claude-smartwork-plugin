/**
 * Memory-capture policy (Sprint 6 follow-up) — the standing instruction that makes cortex's
 * memory a habit, shipped WITH the plugin so every install gets it (no per-user CLAUDE.md edit).
 *
 * Injected once per session by hooks/memory-sessionstart.ts (the same SessionStart-stdout
 * mechanism the cognition primer uses), gated by `memory.captureDecisions` (default on, config
 * off). Cooperate-not-replace: it AUGMENTS native CLAUDE.md / `/memory` / the `remember` plugin —
 * it never tells the model to overwrite them. Token-frugal: one terse block, once per session.
 */
const HEADER =
  '⟦cortex memory — capture & recall policy (augment native memory; never replace CLAUDE.md / /memory / remember)⟧';

/** The standing memory-capture policy block injected at SessionStart. */
export function memoryPolicy(): string {
  return [
    HEADER,
    '- Decisions: when a decision is reached — especially a grey-zone call made after weighing ' +
      'options, or when told to remember one — commit it to cortex via the memory_commit tool ' +
      '(or the /cortex-remember skill): title = the decision in one line, body = what + WHY + the ' +
      'alternatives rejected, tags = "decision,<project>" (<project> = the current repo/directory name).',
    '- Recall: when recalling or consulting memory, also read cortex — memory_recall, or ' +
      '/cortex-recall "<topic>" (--tag decision / --tag <project> to list a category). Treat cortex ' +
      'hits as prior context to verify, alongside native memory.',
  ].join('\n') + '\n';
}
