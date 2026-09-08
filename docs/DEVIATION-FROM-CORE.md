# Deviations from upstream OpenCode

This fork adds a designer-facing split view to the desktop app: the existing
OpenCode chat/session UI on the left, and a browser pane on the right
(currently pointed at `https://www.google.com/` as a prototype placeholder
for a future live-prototype preview). In webview mode, designers can also
arm an element picker in that pane and send a reference to the picked
element (source location, stable identifier, or CSS path) into the chat
composer.

The pane is hosted one of two ways, selected by the single
`DESIGNER_BROWSER_MODE` flag in
[packages/designer-browser/src/contract.ts](../packages/designer-browser/src/contract.ts):

- **`"webview"` (default).** The pane is an Electron `<webview>` rendered
  directly in the page DOM. It participates in normal CSS stacking, so every
  app overlay (settings dialog, command palette, menus, tooltips, toasts —
  all portaled to `document.body` at `position: fixed; inset: 0`) paints
  above it, as it would above any other DOM content. Electron's own
  maintainers consider adding `WebContentsView` support for painting HTML
  above such a view "unfortunately impossible"
  ([electron#15899](https://github.com/electron/electron/issues/15899)), and
  there is no per-overlay or CSS-only fix because the overlays are portaled
  and window-sized, not scoped to the chat pane. `<webview>` is the only way
  to get correct layering, even though Electron's docs discourage the tag
  for production use.
- **`"native"` (fallback).** The original implementation: a `WebContentsView`
  owned by the main process and positioned over IPC. Kept in the package in
  case `<webview>` misbehaves and the flag needs to flip back.

Upstream OpenCode has no renderer UI plugin/slot system, no main-process
extension hooks, and no preload bridge extension point. Because of that, this
feature could not be added as a pure add-on package; a handful of upstream
files in `packages/desktop` needed small, additive edits to mount it. All of
the actual feature logic (bounds math, session/security policy, guest
hardening for both modes, the SolidJS split shell, the `WebContentsView`
controller, and the IPC contract) lives in the fork-owned package
[packages/designer-browser](../packages/designer-browser), so future
upstream merges only need to reconcile the thin touch points listed below,
not the feature itself.

## Isolated package

- [packages/designer-browser](../packages/designer-browser) is a new, private
  workspace package. Nothing outside `packages/desktop` and `packages/app`
  depends on it (the latter only via the generic event contract below, never
  a direct import), and it does not modify `packages/app` or any other
  upstream package.
- The split shell wraps `AppInterface` from the outside; it does not change
  session, layout, or routing code inside `app`. The one exception is the
  element picker's composer bridge, documented below: `AppInterface`'s
  `children`/`serverScoped` slots do not render inside `PromptProvider` (this
  was verified, not assumed), so there is no zero-upstream-change way to
  reach the composer from a slot. Two small, generic, designer-browser-unaware
  files were added to `packages/app` instead.
- `packages/desktop/src/main/index.ts` is untouched. Registration happens in
  `packages/desktop/src/main/ipc.ts`, per this repo's existing rule that all
  main-process IPC handlers live there.

## Touched upstream files

| File | Reason | Owning logic |
| --- | --- | --- |
| [packages/desktop/package.json](../packages/desktop/package.json) | Add the `@opencode-ai/designer-browser` workspace dependency. | n/a (wiring only) |
| [packages/desktop/tsconfig.json](../packages/desktop/tsconfig.json) | Add a TS project reference so `tsgo -b` type-checks the new package. | n/a (wiring only) |
| [packages/desktop/src/main/windows.ts](../packages/desktop/src/main/windows.ts) | Add `webviewTag: true` to the main window's `webPreferences` so it can host a `<webview>` (needed for webview mode), and attach one `designerBrowserRegistry` controller to each main window when in native mode. Two small additions inside `createMainWindow`; existing navigation policy, recovery, and zoom wiring are unchanged. | `packages/designer-browser/src/main.ts`, `src/registry.ts`, `src/contract.ts` |
| [packages/desktop/src/main/ipc.ts](../packages/desktop/src/main/ipc.ts) | Call `setupDesignerBrowser()` once, alongside every other IPC handler registration; it applies webview guest hardening or registers the native IPC bridge depending on the mode. | `packages/designer-browser/src/main.ts` |
| [packages/desktop/src/preload/types.ts](../packages/desktop/src/preload/types.ts) | Add `designerBrowser: DesignerBrowserBridge` to the `ElectronAPI` type exposed to the renderer. | `packages/designer-browser/src/contract.ts` |
| [packages/desktop/src/preload/index.ts](../packages/desktop/src/preload/index.ts) | Spread `createDesignerBrowserPreloadApi()` into the `contextBridge`-exposed `api` object. | `packages/designer-browser/src/preload.ts` |
| [packages/desktop/src/renderer/index.tsx](../packages/desktop/src/renderer/index.tsx) | Wrap the ready `AppInterface` in `<DesignerBrowserSplit>`, reusing the existing `webviewZoom` and `windowFullscreen` signals so the pane remeasures on zoom and fullscreen changes, and wire `onElementPicked` to `notifyComposerInsert`. The loading splash and onboarding flow, which render before `AppInterface` mounts, are unaffected. | `packages/designer-browser/src/split.tsx`, `packages/app/src/components/composer-events.ts` |
| [packages/app/src/components/composer-events.ts](../packages/app/src/components/composer-events.ts) | New file. A generic `window` `CustomEvent` contract (`opencode:composer-insert`) for inserting text into the active composer, following the existing pattern in `titlebar-session-events.ts`. Designer-browser-unaware; plausibly upstreamable on its own. | n/a (the event contract itself) |
| [packages/app/src/components/composer-insert-bridge.tsx](../packages/app/src/components/composer-insert-bridge.tsx) | New file. A renderless component that listens for the event above via `usePrompt()` and appends the text to the composer. Exists because `usePrompt`/`PromptProvider` are not exported outside `packages/app` and `ContextItem` is a closed alias to `FileContextItem`, so a fork-owned package cannot reach the composer directly. | n/a (the bridge itself) |
| [packages/app/src/pages/session.tsx](../packages/app/src/pages/session.tsx) | Mount `<ComposerInsertBridge />` inside `SessionProviders`' `PromptProvider`, one line. | `packages/app/src/components/composer-insert-bridge.tsx` |
| [packages/app/src/app.tsx](../packages/app/src/app.tsx) | Mount `<ComposerInsertBridge />` inside `DraftProviders`' `PromptProvider`, one line, for the new-session draft composer. | `packages/app/src/components/composer-insert-bridge.tsx` |
| [packages/app/package.json](../packages/app/package.json) | Add the `./composer-events` subpath export so `packages/desktop` can call `notifyComposerInsert` without reaching into `src/`. | n/a (wiring only) |

## Security assumptions

Common to both modes:

- The browser pane runs in a dedicated, **non-persistent** session partition
  (`DESIGNER_BROWSER_PARTITION = "designer-browser"`, no `persist:` prefix),
  isolated from the main app's session and from disk; it does not share
  cookies/storage and does not survive relaunches.
- Popups/`window.open` are denied, and every permission request (camera,
  notifications, geolocation, etc.) is denied for that partition.
- Navigation inside the pane is restricted to `http:`/`https:` via
  `isAllowedDesignerBrowserUrl`; other schemes (`file:`, `javascript:`,
  `chrome:`, `data:`, ...) are blocked in `will-navigate`.

Webview mode (default) additionally relies on:

- The guest inherits the embedder window's `sandbox: true`,
  `contextIsolation: true`, and `nodeIntegration: false` — enabling
  `webviewTag: true` on the main window does not weaken the window itself,
  only allows it to host a guest that starts from those same safe defaults.
- `app.on("web-contents-created")` in `setupDesignerBrowser()` applies the
  popup/navigation policy above directly to any `WebContents` of type
  `"webview"`, and separately listens for `will-attach-webview` on the
  embedder's `WebContents` to run `sanitizeDesignerBrowserWebviewParams(...)`,
  which forces `nodeIntegration`/`nodeIntegrationInSubFrames: false`,
  `contextIsolation`/`sandbox: true`, drops any `preload` script, and pins
  the partition to `DESIGNER_BROWSER_PARTITION` — so a compromised or
  unexpected renderer cannot request Node access, a different preload, or a
  different (potentially persistent) session for the guest, regardless of
  what the `<webview>` element's attributes say.
- No IPC channels are exposed for this mode; the pane has no bridge to the
  main process beyond the guest hardening above.
- The element picker adds no new IPC surface and no new preload: it runs via
  `webview.executeJavaScript(...)` on the guest's existing main world (the
  same world the guest's own scripts already run in), returning a `Promise`
  that resolves with the picked element's descriptor. `describeElement` and
  the picker bootstrap ([packages/designer-browser/src/element-reference.ts](../packages/designer-browser/src/element-reference.ts),
  [src/picker.ts](../packages/designer-browser/src/picker.ts)) are
  self-contained functions serialised via `Function.prototype.toString()`
  specifically so no new preload script or guest-side build entry is needed;
  `sanitizeDesignerBrowserWebviewParams` keeps dropping all preloads exactly
  as before. The picker is only offered when `DESIGNER_BROWSER_MODE ===
  "webview"`; native mode would need a new IPC channel and does not have one.

Native mode (fallback) additionally relies on:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no
  preload script on the `WebContentsView` itself — it has no Electron or
  Node access.
- The three IPC channels (`designer-browser-show`, `designer-browser-hide`,
  `designer-browser-set-bounds`) only act on the calling window's own
  controller, and only when the call comes from that window's **main frame**
  (`isTrustedDesignerBrowserSender`), not an arbitrary subframe.
- Bounds sent from the renderer are validated (`isValidDesignerBrowserBounds`)
  and clamped to the owning window's content size
  (`clampDesignerBrowserBounds`) before being applied, so a compromised or
  buggy renderer cannot position the native view outside the window.

## Upstream rebase checklist

When rebasing onto a newer upstream `dev`:

1. Re-apply the edits in the table above if they conflict; they are each a
   few lines and additive (new import + one new call/field/mount), not
   structural changes to the surrounding function.
2. `packages/designer-browser` itself never needs upstream reconciliation —
   it is not touched by upstream commits.
3. If upstream changes `packages/desktop/src/main/windows.ts`'s
   `createMainWindow`, `packages/desktop/src/main/ipc.ts`'s
   `registerIpcHandlers`, or the preload `api` object's shape, re-locate the
   single added line/field rather than re-deriving the integration.
4. If Electron is upgraded, re-check that `<webview>`'s `will-attach-webview`
   event and `webContents.getType() === "webview"` still behave as
   documented (webview mode), and that `WebContentsView`,
   `View.addChildView`/`removeChildView`, `contentView`, and
   `WebContents.close({ waitForBeforeUnload })` (used for pane cleanup) are
   still available with the same semantics (native mode).
5. To flip modes, change the single `DESIGNER_BROWSER_MODE` constant in
   [packages/designer-browser/src/contract.ts](../packages/designer-browser/src/contract.ts);
   no other file needs to change.
6. If upstream changes `PromptStore`/`ContentPart`/`ContextItem`
   ([packages/app/src/context/prompt-state.ts](../packages/app/src/context/prompt-state.ts))
   or adds a real plugin/slot system that reaches inside `PromptProvider`,
   re-check whether `composer-events.ts`/`composer-insert-bridge.tsx` are
   still needed at all, or whether `PromptProvider`'s move point changed.
7. If upstream adds `PromptProvider`/`usePrompt` to `packages/app`'s public
   exports, or moves `SessionProviders`/`DraftProviders`, re-locate the two
   `<ComposerInsertBridge />` mounts rather than re-deriving them.
