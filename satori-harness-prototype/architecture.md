# Architecture and technical findings

Companion to [intent.md](intent.md), which describes what we are building and
why. This document is the technical counterpart: what exists today, what we
tried and rejected, what surprised us, and what a production implementation
needs to know before touching any of it.

Written during the prototype phase. The prototype validated the shape of the
experience; it did not attempt production-grade completeness. Everything below
is written for whoever picks this up next.

See also [docs/DEVIATION-FROM-CORE.md](docs/DEVIATION-FROM-CORE.md), which is
the authoritative, maintained list of upstream files we touch and why. This
document explains the reasoning behind those deviations rather than cataloguing
them.

---

## 1. Constraints that shape everything

This repository is a fork of OpenCode that we intend to keep rebasing on
upstream `dev`. Two rules follow from that, and they drove nearly every
technical decision:

1. **All feature logic lives in a fork-owned workspace package**
   (`packages/designer-browser`). Upstream commits never touch it, so it never
   needs conflict resolution.
2. **Upstream files may only be touched additively, minimally, and with a
   documented reason.** Each touch point should be a new import plus one call
   or one field, never a structural change to a surrounding function, so that a
   conflicting rebase is a re-placement rather than a re-derivation.

OpenCode has no renderer UI plugin/slot system, no main-process extension
hooks, and no preload bridge extension point. There is no way to add this
feature as a pure add-on. The question was never "can we avoid touching
upstream" but "what is the smallest set of touches, and can each one be
described in a sentence".

Repo conventions worth knowing before writing code here are in
[AGENTS.md](AGENTS.md). The ones that actually came up: no star imports and no
aliased imports, prefer inlining single-use values, avoid `else`, run
`bun typecheck` from a package directory rather than invoking `tsc`, and never
run tests from the repo root (there is a guard).

---

## 2. What exists today

### The fork-owned package

`packages/designer-browser` is a private workspace package with subpath exports
per module, so consumers import exactly what they need and the Electron-only
modules never leak into the renderer bundle.

| Module | Role | Electron dependency |
| --- | --- | --- |
| `src/contract.ts` | Shared constants, types, and pure validation/sanitisation logic | None (deliberately) |
| `src/layout.ts` | Split-width clamping and persistence helpers | None |
| `src/registry.ts` | Generic per-window controller lifecycle | None |
| `src/main.ts` | Main-process setup: guest hardening, native controller, IPC | Yes |
| `src/preload.ts` | The `contextBridge`-safe API | Yes |
| `src/split.tsx` | The SolidJS split shell | No (renderer) |
| `src/custom-elements.d.ts` | `<webview>` JSX intrinsic declaration | Ambient types only |

`contract.ts`, `layout.ts`, and `registry.ts` are kept free of runtime
`electron` imports specifically so their logic can be exercised under plain
`bun:test` without mocking Electron. This paid off — the entire security-
relevant surface (bounds clamping, URL allow-listing, sender trust, webview
param sanitisation) is unit tested with no mocks. Keep that property.

### Upstream touch points

All additive. The maintained table with per-file reasoning is in
[docs/DEVIATION-FROM-CORE.md](docs/DEVIATION-FROM-CORE.md). In short: the
desktop package's `package.json` and `tsconfig.json` for wiring, `main/windows.ts`
for `webviewTag: true` and the native-mode registry attach, `main/ipc.ts` for a
single `setupDesignerBrowser()` call, the two preload files for the bridge type
and implementation, and `renderer/index.tsx` to wrap `AppInterface` in the split
shell and wire the element picker's output to the composer.

`packages/app` is *not* untouched, unlike the initial split-view work: the
split shell wraps `AppInterface` from the outside, which is a virtue for
rebasing, but section 8 explains why the element-picker's composer
integration could not stay purely fork-owned, and what the (small, generic)
touch ended up being.

---

## 3. The central decision: `<webview>` over `WebContentsView`

This is the most important thing in this document. If you read nothing else,
read this section, because the obvious choice is the wrong one and we burned
real time discovering that.

### What we built first, and why it failed

The first implementation used `WebContentsView` — the modern, Electron-endorsed
API that replaces the deprecated `BrowserView`. It worked: the pane rendered,
navigated, and was positioned by measuring a placeholder `<div>` in the renderer
and shipping the rect to the main process over IPC.

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
(via the dialog context) and hide the pane while anything is open. Rejected: the
preview content vanishes exactly when the designer is looking at a dialog *about*
it, restoring it needs a snapshot to avoid a flash, and correctness requires
detecting every overlay mechanism in the app — dialogs, Kobalte popovers,
tooltips, dropdown menus, toasts — forever, including ones upstream adds later.
Fragile in a way that fails silently.

**Restructure the window's content views** so the app UI is itself a native view
composited above the pane. Rejected as far too invasive for a fork that must
stay rebasable.

**CSS containment or stacking contexts.** Does nothing. The overlays are
portaled outside the split component's subtree, and the native view is not
participating in CSS compositing at all.

### Why `<webview>` won

An Electron `<webview>` is an out-of-process guest rendered into the page's
shadow DOM. It participates in normal layout and stacking, so overlays paint
above it for free, with no detection logic and no special cases — including for
overlay types nobody has written yet.

The cost is that Electron's documentation actively discourages `<webview>`:
it is architecturally awkward, its API surface changes, and it is periodically
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

**Production decision to make deliberately:** whether to keep native mode at
all. It costs real complexity — the IPC channels, the preload bridge, the
per-window registry, the bounds maths, and three now-optional props on the
split component (`bridge`, `zoomFactor`, `remeasureOn`) that webview mode never
uses. If the answer is "we will never ship native mode", deleting it removes
roughly half the package and two upstream touch points. If the answer is "we
want the escape hatch", it must be kept genuinely working, not left to rot,
which means exercising it in CI or at least manually each Electron upgrade. The
worst outcome is a fallback that is broken when you finally need it.

---

## 4. Webview mechanics and the gotchas we hit

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
  only walks its own document. The guest needs its own DevTools instance,
  which `<webview>` exposes directly via `openDevTools()` and
  `inspectElement(x, y)`.

**`Object.assign` cannot remove a key.** The `will-attach-webview` sanitiser
returns a copy without `preload`, but assigning that copy over the event's
mutable object leaves the original `preload` in place. The `delete` is load-
bearing:

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
files inside the tsconfig `include` glob are picked up automatically — no import
is needed, and adding one is a mistake.

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

## 5. Security model

Both modes share: a dedicated **non-persistent** session partition
(`DESIGNER_BROWSER_PARTITION`, no `persist:` prefix, so no shared cookies or
storage and nothing survives relaunch), denial of all permission requests,
denial of popups, and navigation restricted to `http:`/`https:` via
`isAllowedDesignerBrowserUrl`.

Webview mode adds guest hardening applied in `setupDesignerBrowser()`: the
policy above is attached to any `WebContents` whose type is `"webview"`, and the
embedder's `will-attach-webview` is intercepted to force
`nodeIntegration`/`nodeIntegrationInSubFrames` off, `contextIsolation`/`sandbox`
on, drop any `preload`, and pin the partition — regardless of what the
`<webview>` element's attributes in the DOM claim. A compromised renderer
therefore cannot upgrade the guest's privileges by rewriting attributes.

Two decisions this model forced on the element-picker work, both resolved
without changing the policy above (section 9 covers the built feature):

**The preload policy did not need to change.** The original assumption was
that a robust picker script needs a preload. It does not: `buildPickerSource()`
serialises `describeElement` and the picker bootstrap via
`Function.prototype.toString()` and re-evaluates them with
`webview.executeJavaScript(...)` on demand (armed by a UI toggle, not
persistent), so there is nothing to keep alive across navigations and nothing
that needs to run before page scripts. `sanitizeDesignerBrowserWebviewParams`
keeps dropping every preload exactly as before.

**Main world, deliberately.** `executeJavaScript` runs in the guest's main
world, where the previewed page can observe and tamper with it. Accepted for a
designer's own prototype. Because there is no preload and no persistent
listener, the picker is only ever live for the duration of one armed pick, which
narrows the exposure further. An isolated world
(`executeJavaScriptInIsolatedWorld`) remains available later if this needs
tightening, at the cost of becoming a main-process IPC surface instead of a
pure renderer feature.

---

## 6. The layout bug, and the lesson in it

Before the layering problem, the split shipped with the entire chat pane
rendering black. The cause was mundane and worth recording because it will
recur: the wrapper `div` around `props.children` defaulted to `display: block`,
so `AppInterface`'s `flex-1` child had no flex parent to size against and
collapsed to zero height. The `main` element measured `height: 0`.

The fix was adding `flex flex-col` to that wrapper. The lesson is that
`AppInterface` assumes an unbroken flex-column chain from its mount point, and
that **the height of the `main` element is an excellent regression canary** —
cheap to assert over CDP and it catches an entire class of "wrapped the app in
something new" mistakes. Both verification passes in this project checked it.

---

## 7. Rendering and layout behaviour

The split shell owns the pane width, clamps it between a minimum and a
viewport-relative maximum, and persists it to `localStorage`. Resizing uses the
existing `ResizeHandle` primitive from `@opencode-ai/ui`, so the interaction
matches the rest of the app.

Native mode additionally needs continuous measurement: a `ResizeObserver` on the
placeholder plus a `window` resize listener, with results rescaled by the page
zoom factor (native view bounds are in the window's zoom-independent content
coordinate space, while DOM rects are in zoomed CSS pixels) and re-triggered on
fullscreen transitions, which move the pane without resizing it.

Webview mode needs none of that — the element is laid out by CSS like anything
else. This is a substantial simplification and one of the quieter arguments for
dropping native mode.

---

## 8. Composer integration: built

The headline roadmap feature is selecting an element in the preview and sending
a reference to it into the chat input. The preview half is straightforward. The
chat half ran into the fork-isolation constraint head-on; this section records
the findings that led to the design, and what was actually built.

### The canonical API

Composer state is not a local signal. It is a persisted Solid store exposed
through a context:

```73:73:packages/app/src/context/prompt.tsx
export const { use: usePrompt, provider: PromptProvider } = createSimpleContext({
```

`usePrompt()` returns `set(prompt, cursor?, scope?)`, `context.add(item)`,
`capture(scope)`, `current()`, `reset()`, and a `model` accessor. Both composer
implementations react to store changes, so calling `set(...)` genuinely updates
a mounted composer. This is the correct insertion point; everything else is a
workaround.

The store shape is `{ prompt: ContentPart[], cursor?, model?, context: { items } }`,
persisted per scope through the draft store.

### Why our package cannot reach it

`PromptProvider` is mounted by *route-level* provider groups:

```317:327:packages/app/src/pages/session.tsx
function SessionProviders(props: ParentProps) {
  return (
    <TerminalProvider>
      <FileProvider>
        <PromptProvider>
          <CommentsProvider>{props.children}</CommentsProvider>
        </PromptProvider>
      </FileProvider>
    </TerminalProvider>
  )
}
```

with an equivalent `DraftProviders` for the draft route. Both `AppInterface`
slots mount *above* the router — `children` inside `ServerShell`
(`packages/app/src/app.tsx:570`) and `serverScoped` inside `LayoutProvider`
(`packages/app/src/app.tsx:354`). Solid contexts flow downward only, and
`PromptProvider` sits in a sibling subtree further down, so neither slot can
consume it. Our split shell, which wraps `AppInterface` from the outside, is
further away still.

This was checked specifically in the hope of a zero-upstream-change path. There
isn't one.

### What the slots *are* good for

A fork-owned component in the `children` slot does get the router, settings,
tabs, dialog, notification, permission contexts, and the command registry
(`useCommand` is one of the few things `packages/app` exports publicly). That is
enough to register commands, render fork-owned UI inside the app shell, and —
usefully — resolve the active directory and session id, which is exactly the
`PromptScope` a bridge needs.

### Approaches evaluated and rejected

| Approach | Why not |
| --- | --- |
| Write the draft store directly (the `draft-get`/`draft-set` IPC already exists) | Drafts hydrate once at mount and are not watched. An external write does not update a live composer. |
| `?prompt=` URL parameter or `opencode://new-session?prompt=` deep link | Only applied when there is no session id. Useless for an ongoing session. |
| DOM injection into the composer | It is a contenteditable with rich mention pills, not a textarea. Writing text breaks pills and desynchronises the store. |
| `prompt.context.add(...)` for a nicer "chip" UX | `ContextItem` is a closed alias — `export type ContextItem = FileContextItem` at `packages/app/src/context/prompt-state.ts:64` — so element references need an upstream type extension. Plain text parts need none. |
| Export `usePrompt`/`PromptProvider` and mount a fork-owned hook | Workable, but `packages/app` exports only seven subpaths and none under `./context/`, and it still requires mounting something inside the provider. Same upstream cost, less generality. |

### What was built

A **generic composer-insert event API in `packages/app`**, unaware of the
designer browser, which could plausibly be contributed upstream and thereby
retire the deviation entirely.

This follows an existing convention rather than inventing one. The app already
decouples components with prefixed window `CustomEvent`s, packaged as a small
module holding the event name, a typed detail, a dispatcher, and a validating
reader — see `packages/app/src/components/titlebar-session-events.ts` (35 lines,
with its own unit test) and `opencode:deep-link` in
`packages/app/src/pages/layout/deep-links.ts`. The actual shape, in
`packages/app/src/components/composer-events.ts`:

```ts
export const COMPOSER_INSERT_EVENT = "opencode:composer-insert"

export type ComposerInsertDetail = {
  text: string
  scope?: PromptScope
}

export function notifyComposerInsert(input: ComposerInsertDetail): void
export function readComposerInsertDetail(event: Event): ComposerInsertDetail | undefined
```

`packages/app/src/components/composer-insert-bridge.tsx` is the renderless
listener component, mounted once inside each `PromptProvider` (both
`SessionProviders` in `pages/session.tsx` and `DraftProviders` in `app.tsx`,
one line each). It calls `usePrompt().capture(detail.scope)`, waits on
`prompt.ready.promise` (the persisted store may not have hydrated yet — this
avoids the insert being silently clobbered once it does), and appends via
`appendPromptText`, which extends a trailing `TextPart` instead of creating a
second adjacent one and recomputes `start`/`end` offsets, mirroring how drop and
paste already append: `target.prompt.set([...target.prompt.current(), attachment], target.cursor)`
in `packages/app/src/components/prompt-input/attachments.ts:62`.

**No `ContextItem` chip.** `ContextItem` is a closed alias —
`export type ContextItem = FileContextItem` at
`packages/app/src/context/prompt-state.ts:64` — so a nicer "chip" UX would need
an upstream type extension. A plain text part needs none, so that is what
shipped; text is deliberately not prefixed with `@` since the composer parses
that as a mention trigger.

**Scoping turned out not to matter for this feature.** `PromptScope` is
`{ draftID: string } | { dir: string; id?: string }`
(`packages/app/src/context/prompt-state.ts:65`), and every bridge instance
hears every event, so a scoped design would need each instance to ignore
events for other scopes. But `session.tsx` documents that session tabs on the
same server share one route instance and remount only per server, so exactly
one `PromptProvider` is mounted at a time. The element picker never sets
`scope`, so it always targets the one active provider; `scope` stays in
`ComposerInsertDetail` for generality, but a future scoped caller would need
`usePrompt` to expose per-scope readiness (today `ready` tracks the route's own
scope, not an explicitly captured one).

**Approaches evaluated and rejected** before landing on the event API:

| Approach | Why not |
| --- | --- |
| Write the draft store directly (the `draft-get`/`draft-set` IPC already exists) | Drafts hydrate once at mount and are not watched. An external write does not update a live composer. |
| `?prompt=` URL parameter or `opencode://new-session?prompt=` deep link | Only applied when there is no session id. Useless for an ongoing session. |
| DOM injection into the composer | It is a contenteditable with rich mention pills, not a textarea. Writing text breaks pills and desynchronises the store. |
| Export `usePrompt`/`PromptProvider` and mount a fork-owned hook | Workable, but `packages/app` exported no subpath under `./context/`, and it still requires mounting something inside the provider. Same upstream cost, less generality. |

This was checked specifically in the hope of a zero-upstream-change path (via
`AppInterface`'s `children`/`serverScoped` slots, which mount above the router
and cannot reach the route-level `PromptProvider`). There isn't one; the event
API above is the smallest touch found.

---

## 9. Element picker: built

**Everything lives in `packages/designer-browser`** (`src/element-reference.ts`,
`src/picker.ts`), reached from `src/split.tsx`. Webview mode only — native mode
has no picking IPC surface, so the pick toggle simply does not render there.

**Trigger.** A floating "Pick element" button in the pane's corner (disabled
until the guest's `dom-ready` fires). Arming it calls
`webview.executeJavaScript(buildPickerSource(), true)`; the injected script
installs a `pointer-events: none` outline that follows `mousemove`, and
resolves the returned `Promise` on a capture-phase `click` (which it also
`preventDefault`/`stopPropagation`s, so the previewed page never sees it) or on
`Escape`. Clicking the button again while armed, or unmounting the split
component, cancels via `buildCancelSource()`.

**No preload, no `elementFromPoint`.** Both `describeElement` and the picker
bootstrap are ordinary functions serialised with
`Function.prototype.toString()` into the string `executeJavaScript` evaluates,
so nothing needs to be injected ahead of time (section 5 covers why this
avoided a preload-policy change). Hit-testing uses the click/mousemove event's
own `target`/`composedPath()` rather than point-based
`document.elementFromPoint(x, y)`: the browser has already resolved the
topmost hit at the pointer for any real mouse event, so no coordinate-space
conversion is needed, and — a testability bonus — this also works against
`happy-dom`, which does not implement `elementFromPoint`, so the picker's core
logic is unit tested by dispatching real `MouseEvent`/`KeyboardEvent`s rather
than mocking hit-testing.

**Layered reference resolution** in `describeElement`:

1. **Source location**, walking the element and its ancestors (instrumentation
   tools often hoist source attributes onto a wrapping component): a combined
   `data-source` / `data-source-loc` / `data-v-inspector` attribute holding
   `file:line[:column]`, or split `data-inspector-file`/`-line`/`-column` (or
   `data-source-file`/`-line`/`-column`) attributes. React fiber `_debugSource`
   remains a documented extension point, not built.
2. **Stable identifiers**, element-local only (an ancestor's `id` identifies
   the ancestor, not the picked element): `id`, `data-testid`,
   `data-component`, `name`, `aria-label`, in that order.
3. **Shortened CSS path**, depth-capped at 5 segments, anchored on the nearest
   ancestor `id` or `data-*` attribute (falling back to `nth-of-type` only
   where siblings share a tag).

Always carries the tag name, a truncated text snippet, and the bounding rect.

**Reference format: a self-closing XML-ish tag, not prose.** The first cut of
`formatElementReference` produced prose like
`` element <img> — id="hplogo" `` and
`` element <svg> — [data-hp="1"] > svg ``. Two problems surfaced once real
selector values hit it: a CSS selector or a text snippet can itself contain
quotes, angle brackets, or arbitrary punctuation, which makes free-text
delimiting ambiguous (is that closing `"` part of the selector or the
sentence?), and prose gives the model no reliable seam to parse structured
fields out of a paragraph. The chosen format instead is a single self-closing
tag with escaped attributes, e.g.:

```
<picked-element tag="svg" match="selector" value="[data-hp=&quot;1&quot;] &gt; svg" x="12" y="34" w="56" h="78"/>
```

`escapeXmlAttribute` escapes `&`, `<`, `>`, and `"` before interpolating, so
the tag stays well-formed regardless of what the selector, identifier value,
or text snippet contains — this is exercised directly in
`element-reference.test.ts` against a real `[data-hp="1"] > svg`-shaped
selector and a text snippet containing `&`/`<`/`>`. Deliberately not prefixed
with `@`, which the composer parses as a mention trigger.

**Options considered, and why this one won:**

| Option | Why not (or why deferred) |
| --- | --- |
| A real chip/pill in the composer, like our existing `@file` mentions | This is what production tools in this space actually do — Vercel's v0 ("Each selected element attaches to the main chat input as a reference") and Lovable ("Each selected element attaches to the main chat input as a reference") both render a compact badge, not inline text, with the structured descriptor carried out of band. It's the better end state, but `ContextItem` is a closed alias to `FileContextItem` ([prompt-state.ts:64](packages/app/src/context/prompt-state.ts)), so it needs an upstream schema change plus a chip-rendering component, not just a formatting tweak. Deferred, not rejected — a natural next step if this feature graduates past prototype. |
| Fenced JSON code block per pick | Most machine-parseable, but heaviest visually and multi-line, which reads poorly for what should be a lightweight pointer, especially once multi-select (Lovable supports Cmd/Ctrl-click for several elements in one message) is on the table. |
| Plain inline-code span, `` `<img id="hplogo">` `` | Lighter than JSON, but a single code span can't cleanly carry multiple named fields (match kind, file/line, rect) without inventing its own ad hoc micro-syntax inside the backticks — at which point it is a worse-specified version of the XML tag. |
| Keep the original prose format | The ambiguity problem above is real, not hypothetical: it happened on the very first real page tested (`google.com`). |

Single-pick-per-message for now; multi-select (accumulating several
`<picked-element/>` tags before sending, as Lovable does) is a deliberate
non-goal until single-pick is validated with real usage.

**Self-containment is load-bearing.** Both `describeElement` and the picker
bootstrap function must never reference anything outside their own parameters
— no imports, no shared module-level helpers — because only their own
`toString()` output travels into the guest. This is called out in comments at
both definitions; a refactor that "deduplicates" a helper out of either
function will silently break picking in the guest while looking correct in
the host.

**Known limitation, unchanged from the design:** `event.target`/`elementFromPoint`
do not reach into nested iframes inside the prototype.

**Deliberately out of scope, same as before:** right-click context menu,
`inspectElement(x, y)`, `capturePage(rect)` element screenshots.

---

## 10. Verification playbook

What actually worked, because the obvious approaches did not.

**Drive the running app over CDP.** Launch with `--remote-debugging-port=9222`,
enumerate targets with `curl -s http://127.0.0.1:9222/json/list`, then connect a
raw WebSocket from a `bun` script and issue `Runtime.evaluate` (with
`returnByValue`) and `Page.captureScreenshot`. This sidesteps macOS screen-
recording and window-focus permissions entirely, which blocked both
`screencapture` and `osascript` attempts.

**Screenshots beat hit-testing for layering checks.** An `elementFromPoint`
probe over the pane returned a non-dialog element even with the settings dialog
open, which reads like a failure but is not: the dialog layer sets
`pointer-events: none` (see the snippet in section 3), so hit-testing skips it
by design. `Page.captureScreenshot` showed the dimmed backdrop covering the
preview and settled the question immediately.

**Synthetic keyboard events can trigger app commands.** Dispatching a
`KeyboardEvent` for `mod+comma` on `window` and `document` opened the settings
dialog, which is how the layering check was automated.

**Assert the `main` element's height** as a regression canary (section 6).

**Running the app.** `bun dev:desktop` from the repo root gives HMR and is the
most faithful to what a developer sees; alternatively build with
`bun run electron-vite build` in `packages/desktop` and run
`./node_modules/.bin/electron out/main/index.js`. Two operational notes: kill
the previous instance after rebuilding or you will verify stale code, and
backgrounded instances in this environment tend to exit on their own after a
few minutes, so gather evidence promptly after launch.

**Tests and checks.** `bun test src` and `bun typecheck` from
`packages/designer-browser`, `bun typecheck` from `packages/desktop`, and
`bun run electron-vite build`. Note a pre-existing, unrelated failure: the
`packages/desktop` test suite fails with
`error: No such built-in module: node:sqlite` regardless of these changes.

**The element picker was exercised end to end over CDP against a real,
uninstrumented page**, not just against fixtures: connect to both the `page`
target (the app) and the `webview` target (the guest) from `/json/list`, click
the "Pick element" button via `Runtime.evaluate` on the page target, confirm
one `pointer-events: none` outline node exists on the guest target, dispatch a
real `mousemove`/`click` on a guest element via `Runtime.evaluate`, then read
`[contenteditable="true"]`'s `textContent` back on the page target. Clicking
Google's logo image — which carries an `id` but no source attribute — produced
exactly `<picked-element tag="img" match="identifier" attribute="id"
value="hplogo" x="144" y="60" w="112" h="150"/>` in the composer (real
captured values, not illustrative ones), exercising the identifier tier (not
just the source or CSS-path tiers, which the unit tests already covered)
against a page nobody instrumented for this feature. Clicking a link with only
an `aria-label` (Gmail) landed the `attribute="aria-label"` case the same way.
The "Cancel pick"/"Pick element" button label round-tripped correctly, and
`Page.captureScreenshot` confirmed the toggle renders in the pane's corner
without disturbing the overlay layering from section 3 (Google's own cookie
consent dialog and its own logo doodle both still painted above the pane).

**Finding: picking requires a mounted composer.** The first verification
attempt read back `null` from the composer, because the app had launched onto
the session-list landing route, where no `PromptProvider` — and therefore no
`ComposerInsertBridge` — is mounted. `notifyComposerInsert` on a route with no
listener is a silent no-op; the pick still completes and the button still
disarms, but the reference goes nowhere. Clicking "New session" to reach a
route with a composer fixed it. This is a real gap, not just a test setup
quirk — see the open decision in section 11.

---

## 11. Open decisions for production

Ordered roughly by how much downstream work they unblock. Two items from the
original list — preload policy for the guest, and main-world-versus-isolated
for injected scripts — are closed for the element picker as built (section 5
and section 9): no preload was needed, and main-world execution was accepted
deliberately, scoped to the duration of one armed pick.

1. **Keep or drop native mode** (section 3). Shapes how much of the package and
   how many upstream touch points survive.
2. **Shape and ownership of the composer-insert API** (section 8), including
   whether to propose it upstream, and multi-tab scoping semantics beyond the
   single-active-provider case the element picker relies on today.
3. **Upgrade the reference from an inline `<picked-element/>` tag to a real
   chip/pill** (section 9), matching how v0 and Lovable actually do this.
   Requires extending `ContextItem` beyond `FileContextItem` upstream and a
   chip-rendering component — a bigger, deliberate investment, not a
   formatting tweak. Do this once the picker's usefulness is validated, not
   speculatively.
4. **Multi-select picking** (section 9), accumulating several picks into one
   message the way Lovable's Cmd/Ctrl-click does, once single-pick is
   validated with real usage.
5. **What prototypes designers will actually preview.** Dev-server-backed
   prototypes make source-location references possible; static exports and
   hosted design-tool prototypes do not, which changes what the picker can
   promise.
6. **How the agent sets the preview destination.** The intent is an
   agent-controlled, non-navigable pane; today the URL is a hard-coded constant
   with an `http(s)`-only navigation guard. Production needs an actual
   mechanism, and that mechanism becomes a new trust boundary — decide what the
   agent is permitted to point the pane at.
7. **Electron upgrade policy.** `<webview>` carries deprecation risk. At
   minimum, re-verify `will-attach-webview` semantics and
   `getType() === "webview"` on each upgrade; the rebase checklist in the
   deviation doc covers this.
8. **Revisit main-world execution if the picker grows a persistent trigger**
   (for example, always-on hover outlining rather than an explicit arm/click).
   The current design's safety argument rests on the picker only ever running
   for the duration of one armed pick; a persistent variant would need the
   isolated-world/IPC tradeoff in section 5 re-evaluated.
9. **Decide what happens when a pick has nowhere to land** (section 10's
   verification finding). Today `notifyComposerInsert` silently no-ops if no
   `PromptProvider`/`ComposerInsertBridge` is mounted — for example on the
   session-list landing route, or a draft/session tab other than the one the
   designer is currently viewing. Options worth weighing: disable the pick
   button when there is no active composer to target, route the reference
   through a start-new-session flow instead of dropping it, or surface
   feedback (a toast) when a pick had nothing to insert into.
