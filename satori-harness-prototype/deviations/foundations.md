# Foundations

**Status:** living document.

Cross-cutting principles for how this fork stays rebasable, plus the generic
rebase-checklist items that aren't specific to any one feature. Per-feature
touch points and their own rebase notes live in the sibling documents in this
folder.

## Why a deviation log at all

Upstream OpenCode has no renderer UI plugin/slot system, no main-process
extension hooks, and no preload bridge extension point. Every feature in this
fork that needs to reach into the running app — mount a new pane, insert text
into the composer, expose a new IPC bridge — therefore needs a handful of
small, additive edits to upstream files. Left untracked, those edits are
exactly what makes a fork unrebasable: nobody remembers which lines were
"ours" once a real upstream commit touches the same file. This log exists so
that never has to be re-discovered by re-reading diffs.

## How we keep the touched surface small

- **Feature logic lives in fork-owned packages, not in upstream files.** Today
  that's [packages/designer-browser](../../packages/designer-browser). Bounds
  math, session/security policy, guest hardening, the SolidJS split shell, the
  `WebContentsView` controller, and the IPC contract all live there, so a
  future upstream merge only needs to reconcile the thin integration points
  listed in the feature documents, not re-derive the feature itself.
- **Nothing upstream depends on a fork-owned package directly**, except at the
  one or two integration points a feature genuinely needs (typically
  `packages/desktop`'s renderer, which is the one place already wiring
  fork-owned pieces into the running app). Where an upstream package needs to
  talk to a fork-owned one, the bridge is a generic, feature-unaware
  `window` `CustomEvent` contract (see `element-picker.md` and
  `preview-pane.md` for two examples) — never a direct import of the
  fork-owned package from deep inside upstream code.
- **`packages/desktop/src/main/index.ts` is untouched.** Main-process IPC
  handler registration happens in `packages/desktop/src/main/ipc.ts`, per this
  repo's existing rule that all such registration lives there — a fork feature
  follows that rule rather than adding its own registration path.
- **The split shell wraps `AppInterface` from the outside.** It does not
  change session, layout, or routing code inside `packages/app`. Every
  exception to that is a deliberate, individually justified integration point,
  recorded in the owning feature's document — never a silent one.

## Generic rebase checklist

These apply regardless of which feature a conflict comes from. Feature-
specific rebase notes are at the end of each `deviations/<feature>.md`.

1. Re-apply a conflicting edit from any feature's touched-files table as-is
   where possible — every one of them is a few lines and additive (a new
   import plus one new call/field/mount), not a structural change to the
   surrounding function. None of them should require re-deriving the
   integration from scratch.
2. Fork-owned packages themselves (today,
   [packages/designer-browser](../../packages/designer-browser)) never need
   upstream reconciliation — they are not touched by upstream commits at all.
