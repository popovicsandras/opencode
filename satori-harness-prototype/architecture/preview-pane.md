# Preview pane

**Status:** built (prototype, hard-coded placeholder destination).

Product counterpart: [intent/preview-pane.md](../intent/preview-pane.md).

This document contains the single most important technical decision in the
project. If you read nothing else here, read "The central decision" below,
because the obvious choice is the wrong one and we burned real time
discovering that.

---

## The central decision: `<webview>` over `WebContentsView`

### What we built first, and why it failed

The first implementation used `WebContentsView` — the modern,
Electron-endorsed API that replaces the deprecated `BrowserView`. It worked:
the pane rendered, navigated, and was positioned by measuring a placeholder
`<div>` in the renderer and shipping the rect to the main process over IPC.

Then the settings dialog opened, and rendered *behind* the browser pane.

`WebContentsView` is an OS-level native view that lives outside the DOM
entirely. It always composites above all HTML in the window. This is not a
z-index problem and it has no CSS workaround. Electron's maintainers closed the
request to support HTML painting above such a view as "unfortunately
impossible" ([electron#15899](https://github.com/electron/electron/issues/15899)).

The reason it breaks *everything* rather than just one dialog is how the app
renders overlays. Every dialog is portaled to `document.body` and sized to the
whole window:

```104:114:packages/ui/src/context/dialog.tsx
              <div
                data-dialog-layer={layer}
                style={{
                  position: "fixed",
                  inset: "0",
                  "z-index": String(zIndex),
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  "pointer-events": "none",
                }}
              >
```

Menus, popovers, tooltips, and toasts do the same thing through Kobalte/Solid
portals. So there is no component to fix and no container to scope: the pane
had to move into the DOM.

### Alternatives we weighed and rejected

**Auto-hide the native view whenever an overlay opens.** Detect overlay state
(via the dialog context) and hide the pane while anything is open. Rejected:
the preview content vanishes exactly when the designer is looking at a dialog
*about* it, restoring it needs a snapshot to avoid a flash, and correctness
requires detecting every overlay mechanism in the app — dialogs, Kobalte
popovers, tooltips, dropdown menus, toasts — forever, including ones upstream
adds later. Fragile in a way that fails silently.

**Restructure the window's content views** so the app UI is itself a native
view composited above the pane. Rejected as far too invasive for a fork that
must stay rebasable.

**CSS containment or stacking contexts.** Does nothing. The overlays are
portaled outside the split component's subtree, and the native view is not
participating in CSS compositing at all.

### Why `<webview>` won

An Electron `<webview>` is an out-of-process guest rendered into the page's
shadow DOM. It participates in normal layout and stacking, so overlays paint
above it for free, with no detection logic and no special cases — including for
overlay types nobody has written yet.

The cost is that Electron's documentation actively discourages `<webview>`: it
is architecturally awkward, its API surface changes, and it is periodically
threatened with deprecation. We accepted that, because correct layering is
non-negotiable for the product and no alternative delivers it.

### The mode flag

Because `<webview>` carries deprecation risk, we did not delete the native
implementation. Both live behind one constant:

```27:34:packages/designer-browser/src/contract.ts
/**
 * Selects how the pane is hosted. `"webview"` (default) puts it in the page
 * DOM as an Electron `<webview>`, so app overlays (dialogs, menus, toasts)
 * paint above it through normal stacking. `"native"` is the original
 * `WebContentsView` implementation, kept as a fallback since Electron
 * discourages `<webview>` for production use.
 */
export const DESIGNER_BROWSER_MODE: "webview" | "native" = "webview"
```

Both the main process and the renderer read it, so flipping it switches
rendering, hardening, IPC registration, and per-window controller attachment
together. Nothing else needs to change.

---

## Webview mechanics and the gotchas we hit

**The embedder must opt in.** `webviewTag: true` on the hosting window's
`webPreferences`. This does not weaken the window: the guest inherits the
embedder's `sandbox`, `contextIsolation`, and `nodeIntegration` values.

**The guest is a separate process and a separate CDP target.** Confirmed
empirically — enumerating targets shows two entries, the `page` for the app and
a `webview` for the guest, with the guest carrying the embedder's id as
`parentId`. Two user-visible consequences follow directly, and both were
initially mistaken for bugs:

- *No right-click menu.* Electron never provides a default context menu for any
  `webContents` — not for a `BrowserWindow`, not for `WebContentsView`, not for
  `<webview>`. Apps that have one build it from the `context-menu` event. So
  this was never implemented rather than broken, and the same would have been
  true in native mode.
- *DevTools cannot inspect into the guest.* The host window's Elements panel
  only walks its own document. The guest needs its own DevTools instance, which
  `<webview>` exposes directly via `openDevTools()` and `inspectElement(x, y)`.

**`Object.assign` cannot remove a key.** The `will-attach-webview` sanitiser
returns a copy without `preload`, but assigning that copy over the event's
mutable object leaves the original `preload` in place. The `delete` is
load-bearing:

```105:113:packages/designer-browser/src/main.ts
    contents.on("will-attach-webview", (_event, webPreferences, params) => {
      const sanitized = sanitizeDesignerBrowserWebviewParams(webPreferences, params)
      // `sanitizeDesignerBrowserWebviewParams` drops `preload` from its
      // returned copy; `Object.assign` alone wouldn't remove it from this
      // (mutable) event object, so delete it explicitly before reapplying.
      delete webPreferences.preload
      Object.assign(webPreferences, sanitized.webPreferences)
      Object.assign(params, sanitized.params)
    })
```

**TypeScript needs an intrinsic element declaration.** `<webview>` is not in
Solid's JSX types. `src/custom-elements.d.ts` declares it, following the
existing precedent at `packages/ui/src/custom-elements.d.ts`. Ambient `.d.ts`
files inside the tsconfig `include` glob are picked up automatically — no
import is needed, and adding one is a mistake.

**Keep Electron types out of `contract.ts` without breaking assignability.**
Electron types `will-attach-webview` as
`(event, webPreferences: WebPreferences, params: Record<string, string>)`. Our
contract mirrors those structurally. Crucially, the `webPreferences` parameter
type must *not* declare a string index signature: TypeScript refuses to assign
an interface without an index signature (Electron's `WebPreferences`) to a type
that has one. Declaring only the fields we care about keeps it assignable and
keeps the module Electron-free.

**The `<webview>` element API is directly available from the renderer**, even
under sandbox, because calls are proxied to the browser process. The methods
that matter for the roadmap: `executeJavaScript`, `openDevTools`,
`inspectElement(x, y)`, `capturePage(rect)`, `goBack`/`goForward`/`reload`,
`getWebContentsId`. The events that matter: `dom-ready` and `context-menu`.

---

## Security model

Both modes share: a dedicated **non-persistent** session partition
(`DESIGNER_BROWSER_PARTITION`, no `persist:` prefix, so no shared cookies or
storage and nothing survives relaunch), denial of all permission requests,
denial of popups, and navigation restricted to `http:`/`https:` via
`isAllowedDesignerBrowserUrl`.

Webview mode adds guest hardening applied in `setupDesignerBrowser()`: the
policy above is attached to any `WebContents` whose type is `"webview"`, and
the embedder's `will-attach-webview` is intercepted to force
`nodeIntegration`/`nodeIntegrationInSubFrames` off,
`contextIsolation`/`sandbox` on, drop any `preload`, and pin the partition —
regardless of what the `<webview>` element's attributes in the DOM claim. A
compromised renderer therefore cannot upgrade the guest's privileges by
rewriting attributes.

The element picker needed script execution inside the guest and was built
without weakening any of the above; the two decisions that forced are recorded
in [element-picker.md](element-picker.md).

---

## Native mode: what it still costs

Native mode needs continuous measurement that webview mode does not: a
`ResizeObserver` on the placeholder plus a `window` resize listener, with
results rescaled by the page zoom factor (native view bounds are in the
window's zoom-independent content coordinate space, while DOM rects are in
zoomed CSS pixels) and re-triggered on fullscreen transitions, which move the
pane without resizing it.

It also carries the IPC channels, the preload bridge, the per-window registry,
the bounds maths, and three otherwise-unneeded props on the split component
(`bridge`, `zoomFactor`, `remeasureOn`).

---

## Open decisions

1. **Keep or drop native mode.** It costs real complexity, listed directly
   above. If the answer is "we will never ship native mode", deleting it
   removes roughly half the package and two upstream touch points. If the
   answer is "we want the escape hatch", it must be kept genuinely working, not
   left to rot, which means exercising it in CI or at least manually on each
   Electron upgrade. **The worst outcome is a fallback that is broken when you
   finally need it.**
2. **How the agent sets the preview destination.** The intent is an
   agent-controlled, non-navigable pane; today the URL is a hard-coded constant
   with an `http(s)`-only navigation guard. Production needs an actual
   mechanism, and that mechanism becomes a new trust boundary — decide what the
   agent is permitted to point the pane at.
3. **What prototypes designers will actually preview.** Dev-server-backed
   prototypes make source-location references possible; static exports and
   hosted design-tool prototypes do not, which changes what the element picker
   can promise.
4. **Electron upgrade policy.** `<webview>` carries deprecation risk. At
   minimum, re-verify `will-attach-webview` semantics and
   `getType() === "webview"` on each upgrade; the rebase checklist in
   [docs/DEVIATION-FROM-CORE.md](../../docs/DEVIATION-FROM-CORE.md) covers this.
