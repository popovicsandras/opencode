# Split view

**Status:** built (prototype).

Product counterpart: [intent/split-view.md](../intent/split-view.md).
Technical counterpart: [architecture/split-view.md](../architecture/split-view.md).

The touches below are the minimum needed for the fork-owned
[packages/designer-browser](../../packages/designer-browser) package to exist
and be wrapped around `AppInterface` at all. They carry no mode-specific or
feature-specific logic — that's `preview-pane.md` and `element-picker.md`.

## Touched upstream files

| File | Reason | Owning logic |
| --- | --- | --- |
| [packages/desktop/package.json](../../packages/desktop/package.json) | Add the `@opencode-ai/designer-browser` workspace dependency. | n/a (wiring only) |
| [packages/desktop/tsconfig.json](../../packages/desktop/tsconfig.json) | Add a TS project reference so `tsgo -b` type-checks the new package. | n/a (wiring only) |
| [packages/desktop/src/renderer/index.tsx](../../packages/desktop/src/renderer/index.tsx) | Wrap the ready `AppInterface` in `<DesignerBrowserSplit>`. This is the base wrap only — the mode-specific props (`bridge`, `zoomFactor`, `remeasureOn`, `visible`) and the `onElementPicked` callback are separate concerns, recorded in `preview-pane.md` and `element-picker.md` respectively, since they were added incrementally by those features on top of this same wrap. | `packages/designer-browser/src/split.tsx` |

## Rebase notes

None beyond the generic checklist in
[foundations.md](foundations.md#generic-rebase-checklist) — these touches are
inert wiring with nothing feature-specific to re-derive.
