# Element picker

**Status:** built (prototype).

Product counterpart: [intent/element-picker.md](../intent/element-picker.md).
Technical counterpart: [architecture/element-picker.md](../architecture/element-picker.md).

Delivery half of the feature (capture happens entirely inside the fork-owned
package and needs no upstream touch): getting a picked element's reference
from the pane into the chat composer, which lives in a different component
tree (see `packages/app/src/pages/session.tsx` / `app.tsx`, joined to the
pane only in `packages/desktop/src/renderer/index.tsx`).

## Touched upstream files

| File | Reason | Owning logic |
| --- | --- | --- |
| [packages/desktop/src/renderer/index.tsx](../../packages/desktop/src/renderer/index.tsx) | On top of the base `<DesignerBrowserSplit>` wrap (see `split-view.md`): wire `onElementPicked` to `notifyComposerInsert`. | `packages/app/src/components/composer-events.ts` |
| [packages/app/src/components/composer-events.ts](../../packages/app/src/components/composer-events.ts) | New file. A generic `window` `CustomEvent` contract (`opencode:composer-insert`) for inserting text into the active composer, following the existing pattern in `titlebar-session-events.ts`. Designer-browser-unaware; plausibly upstreamable on its own. | n/a (the event contract itself) |
| [packages/app/src/components/composer-insert-bridge.tsx](../../packages/app/src/components/composer-insert-bridge.tsx) | New file. A renderless component that listens for the event above via `usePrompt()` and appends the text to the composer. Exists because `usePrompt`/`PromptProvider` are not exported outside `packages/app` and `ContextItem` is a closed alias to `FileContextItem`, so a fork-owned package cannot reach the composer directly. | n/a (the bridge itself) |
| [packages/app/src/pages/session.tsx](../../packages/app/src/pages/session.tsx) | Mount `<ComposerInsertBridge />` inside `SessionProviders`' `PromptProvider`, one line. | `packages/app/src/components/composer-insert-bridge.tsx` |
| [packages/app/src/app.tsx](../../packages/app/src/app.tsx) | Mount `<ComposerInsertBridge />` inside `DraftProviders`' `PromptProvider`, one line, for the new-session draft composer. | `packages/app/src/components/composer-insert-bridge.tsx` |
| [packages/app/package.json](../../packages/app/package.json) | Add the `./composer-events` subpath export so `packages/desktop` can call `notifyComposerInsert` without reaching into `src/`. | n/a (wiring only) |

## Security assumptions

The element picker adds no new IPC surface and no new preload: it runs via
`webview.executeJavaScript(...)` on the guest's existing main world (the same
world the guest's own scripts already run in), returning a `Promise` that
resolves with the picked element's descriptor. `describeElement` and the
picker bootstrap
([packages/designer-browser/src/element-reference.ts](../../packages/designer-browser/src/element-reference.ts),
[src/picker.ts](../../packages/designer-browser/src/picker.ts)) are
self-contained functions serialised via `Function.prototype.toString()`
specifically so no new preload script or guest-side build entry is needed;
`sanitizeDesignerBrowserWebviewParams` (see `preview-pane.md`) keeps dropping
all preloads exactly as before. The picker is only offered when
`DESIGNER_BROWSER_MODE === "webview"`; native mode would need a new IPC
channel and does not have one.

## Rebase notes

In addition to the generic checklist in
[foundations.md](foundations.md#generic-rebase-checklist):

1. If upstream changes `PromptStore`/`ContentPart`/`ContextItem`
   ([packages/app/src/context/prompt-state.ts](../../packages/app/src/context/prompt-state.ts))
   or adds a real plugin/slot system that reaches inside `PromptProvider`,
   re-check whether `composer-events.ts`/`composer-insert-bridge.tsx` are
   still needed at all, or whether `PromptProvider`'s move point changed.
2. If upstream adds `PromptProvider`/`usePrompt` to `packages/app`'s public
   exports, or moves `SessionProviders`/`DraftProviders`, re-locate the two
   `<ComposerInsertBridge />` mounts rather than re-deriving them.
