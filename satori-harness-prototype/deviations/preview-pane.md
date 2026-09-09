# Preview pane

**Status:** built (prototype, hard-coded placeholder destination).

Product counterpart: [intent/preview-pane.md](../intent/preview-pane.md).
Technical counterpart: [architecture/preview-pane.md](../architecture/preview-pane.md)
— read that first for *why* each of these touches exists; this document only
enumerates them.

Covers: hosting the pane as either an Electron `<webview>` (default) or a
`WebContentsView` (fallback) behind the single `DESIGNER_BROWSER_MODE` flag in
[packages/designer-browser/src/contract.ts](../../packages/designer-browser/src/contract.ts),
and the chat-composer button that hides/re-shows the pane.

## Touched upstream files

| File | Reason | Owning logic |
| --- | --- | --- |
| [packages/desktop/src/main/windows.ts](../../packages/desktop/src/main/windows.ts) | Add `webviewTag: true` to the main window's `webPreferences` so it can host a `<webview>` (needed for webview mode), and attach one `designerBrowserRegistry` controller to each main window when in native mode. Two small additions inside `createMainWindow`; existing navigation policy, recovery, and zoom wiring are unchanged. | `packages/designer-browser/src/main.ts`, `src/registry.ts`, `src/contract.ts` |
| [packages/desktop/src/main/ipc.ts](../../packages/desktop/src/main/ipc.ts) | Call `setupDesignerBrowser()` once, alongside every other IPC handler registration; it applies webview guest hardening or registers the native IPC bridge depending on the mode. | `packages/designer-browser/src/main.ts` |
| [packages/desktop/src/preload/types.ts](../../packages/desktop/src/preload/types.ts) | Add `designerBrowser: DesignerBrowserBridge` to the `ElectronAPI` type exposed to the renderer. | `packages/designer-browser/src/contract.ts` |
| [packages/desktop/src/preload/index.ts](../../packages/desktop/src/preload/index.ts) | Spread `createDesignerBrowserPreloadApi()` into the `contextBridge`-exposed `api` object. | `packages/designer-browser/src/preload.ts` |
| [packages/desktop/src/renderer/index.tsx](../../packages/desktop/src/renderer/index.tsx) | On top of the base `<DesignerBrowserSplit>` wrap (see `split-view.md`): pass `zoomFactor`/`remeasureOn` (reusing the existing `webviewZoom`/`windowFullscreen` signals, needed for native-mode bounds measurement), and own the `browserVisible` signal passed as the `visible` prop — listening for the toggle-request event from the composer button and re-broadcasting the current value so the button's pressed-state stays in sync. | `packages/designer-browser/src/split.tsx`, `packages/ui/src/components/designer-browser-events.tsx` |
| [packages/app/src/components/prompt-input-v2.tsx](../../packages/app/src/components/prompt-input-v2.tsx) | Pass `showBrowserToggle={platform.platform === "desktop"}` into session-ui's `PromptInputV2`, using the already-imported `usePlatform()`, so the toggle button only renders where a browser pane can actually exist (never on web/VS Code). | `packages/session-ui/src/v2/components/prompt-input/index.tsx` |
| [packages/session-ui/src/v2/components/prompt-input/index.tsx](../../packages/session-ui/src/v2/components/prompt-input/index.tsx) | New `PromptInputV2BrowserToggleButton` (an `IconButtonV2`, `monitor` icon), rendered left of the send/stop button when `showBrowserToggle` is set. Dispatches the toggle-request event on click and listens for the visibility-changed event to keep its own pressed-state in sync. | `packages/ui/src/components/designer-browser-events.tsx` |
| [packages/ui/src/components/designer-browser-events.tsx](../../packages/ui/src/components/designer-browser-events.tsx) | New file. A generic `window` `CustomEvent` contract — one event for "toggle requested" (composer → desktop renderer), one for "visibility changed" (desktop renderer → composer) — mirroring `composer-events.ts`'s shape (see `element-picker.md`). Lives in `packages/ui` rather than `packages/app` or `packages/designer-browser` because it's the one package both the button (`packages/session-ui`) and the wiring point (`packages/desktop`) already depend on without creating a cycle. Designer-browser-unaware. | n/a (the event contract itself) |
| [packages/ui/src/i18n/en.ts](../../packages/ui/src/i18n/en.ts) | Add `ui.promptInput.showBrowser`/`ui.promptInput.hideBrowser` translation strings for the toggle button's tooltip/`aria-label`. | n/a (translation strings only) |

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
  main process beyond the guest hardening above. (The element picker's own
  security properties, which build on this hardening, are recorded in
  [element-picker.md](element-picker.md).)

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

## Rebase notes

In addition to the generic checklist in
[foundations.md](foundations.md#generic-rebase-checklist):

1. If upstream changes `packages/desktop/src/main/windows.ts`'s
   `createMainWindow`, `packages/desktop/src/main/ipc.ts`'s
   `registerIpcHandlers`, or the preload `api` object's shape, re-locate the
   single added line/field rather than re-deriving the integration.
2. If Electron is upgraded, re-check that `<webview>`'s `will-attach-webview`
   event and `webContents.getType() === "webview"` still behave as
   documented (webview mode), and that `WebContentsView`,
   `View.addChildView`/`removeChildView`, `contentView`, and
   `WebContents.close({ waitForBeforeUnload })` (used for pane cleanup) are
   still available with the same semantics (native mode).
3. To flip modes, change the single `DESIGNER_BROWSER_MODE` constant in
   [packages/designer-browser/src/contract.ts](../../packages/designer-browser/src/contract.ts);
   no other file needs to change.
4. If upstream restructures `packages/session-ui`'s `PromptInputV2` footer row
   or `packages/app`'s `PromptInputV2Composer`, re-locate the
   `PromptInputV2BrowserToggleButton` render and the `showBrowserToggle` prop
   rather than re-deriving them; the event contract itself
   (`packages/ui/src/components/designer-browser-events.tsx`) needs no
   reconciliation, same as `composer-events.ts`.
