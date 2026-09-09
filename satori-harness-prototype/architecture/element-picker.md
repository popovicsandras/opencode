# Element picker

**Status:** built (prototype).

Product counterpart: [intent/element-picker.md](../intent/element-picker.md).

Two halves: capturing the element in the guest, and delivering a reference to
it into the chat composer. The capture half is straightforward. The delivery
half ran into the fork-isolation constraint head-on and is the reason
`packages/app` is no longer untouched.

---

## Capturing the element

**Everything lives in `packages/designer-browser`**
(`src/element-reference.ts`, `src/picker.ts`), reached from `src/split.tsx`.
Webview mode only — native mode has no picking IPC surface, so the pick toggle
simply does not render there.

**Trigger.** A floating "Pick element" button in the pane's corner (disabled
until the guest's `dom-ready` fires). Arming it calls
`webview.executeJavaScript(buildPickerSource(), true)`; the injected script
installs a `pointer-events: none` outline that follows `mousemove`, and
resolves the returned `Promise` on a capture-phase `click` (which it also
`preventDefault`/`stopPropagation`s, so the previewed page never sees it) or on
`Escape`. Clicking the button again while armed, or unmounting the split
component, cancels via `buildCancelSource()`.

**No preload, no `elementFromPoint`.** Both `describeElement` and the picker
bootstrap are ordinary functions serialised with `Function.prototype.toString()`
into the string `executeJavaScript` evaluates, so nothing needs to be injected
ahead of time. Hit-testing uses the click/mousemove event's own
`target`/`composedPath()` rather than point-based
`document.elementFromPoint(x, y)`: the browser has already resolved the topmost
hit at the pointer for any real mouse event, so no coordinate-space conversion
is needed, and — a testability bonus — this also works against `happy-dom`,
which does not implement `elementFromPoint`, so the picker's core logic is unit
tested by dispatching real `MouseEvent`/`KeyboardEvent`s rather than mocking
hit-testing.

**Self-containment is load-bearing.** Both `describeElement` and the picker
bootstrap function must never reference anything outside their own parameters —
no imports, no shared module-level helpers — because only their own
`toString()` output travels into the guest. This is called out in comments at
both definitions; a refactor that "deduplicates" a helper out of either
function will silently break picking in the guest while looking correct in the
host.

### Layered reference resolution

In `describeElement`, in order:

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

### Reference format: a self-closing XML-ish tag, not prose

The first cut of `formatElementReference` produced prose like
`` element <img> — id="hplogo" `` and `` element <svg> — [data-hp="1"] > svg ``.
Two problems surfaced once real selector values hit it: a CSS selector or a
text snippet can itself contain quotes, angle brackets, or arbitrary
punctuation, which makes free-text delimiting ambiguous (is that closing `"`
part of the selector or the sentence?), and prose gives the model no reliable
seam to parse structured fields out of a paragraph. The chosen format instead
is a single self-closing tag with escaped attributes:

```
<picked-element tag="svg" match="selector" value="[data-hp=&quot;1&quot;] &gt; svg" x="12" y="34" w="56" h="78"/>
```

`escapeXmlAttribute` escapes `&`, `<`, `>`, and `"` before interpolating, so
the tag stays well-formed regardless of what the selector, identifier value, or
text snippet contains — this is exercised directly in `element-reference.test.ts`
against a real `[data-hp="1"] > svg`-shaped selector and a text snippet
containing `&`/`<`/`>`. Deliberately not prefixed with `@`, which the composer
parses as a mention trigger.

**Options considered, and why this one won:**

| Option | Why not (or why deferred) |
| --- | --- |
| A real chip/pill in the composer, like our existing `@file` mentions | This is what production tools in this space actually do — Vercel's v0 and Lovable both render a compact badge, not inline text, with the structured descriptor carried out of band. It's the better end state, but `ContextItem` is a closed alias to `FileContextItem` ([prompt-state.ts:64](../../packages/app/src/context/prompt-state.ts)), so it needs an upstream schema change plus a chip-rendering component, not just a formatting tweak. Deferred, not rejected. |
| Fenced JSON code block per pick | Most machine-parseable, but heaviest visually and multi-line, which reads poorly for what should be a lightweight pointer, especially once multi-select is on the table. |
| Plain inline-code span, `` `<img id="hplogo">` `` | Lighter than JSON, but a single code span can't cleanly carry multiple named fields (match kind, file/line, rect) without inventing its own ad hoc micro-syntax inside the backticks — at which point it is a worse-specified version of the XML tag. |
| Keep the original prose format | The ambiguity problem above is real, not hypothetical: it happened on the very first real page tested (`google.com`). |

### Security decisions this forced

Both were resolved without changing the guest security policy in
[preview-pane.md](preview-pane.md).

**The preload policy did not need to change.** The original assumption was that
a robust picker script needs a preload. It does not: because
`buildPickerSource()` re-evaluates serialised functions on demand (armed by a
UI toggle, not persistent), there is nothing to keep alive across navigations
and nothing that needs to run before page scripts.
`sanitizeDesignerBrowserWebviewParams` keeps dropping every preload exactly as
before.

**Main world, deliberately.** `executeJavaScript` runs in the guest's main
world, where the previewed page can observe and tamper with it. Accepted for a
designer's own prototype. Because there is no preload and no persistent
listener, the picker is only ever live for the duration of one armed pick,
which narrows the exposure further. An isolated world
(`executeJavaScriptInIsolatedWorld`) remains available later if this needs
tightening, at the cost of becoming a main-process IPC surface instead of a
pure renderer feature.

### Known limitations

- `event.target`/`elementFromPoint` do not reach into nested iframes inside the
  prototype.
- Deliberately out of scope: right-click context menu, `inspectElement(x, y)`,
  `capturePage(rect)` element screenshots.

---

## Delivering it to the composer

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
(`useCommand` is one of the few things `packages/app` exports publicly). That
is enough to register commands, render fork-owned UI inside the app shell, and
— usefully — resolve the active directory and session id, which is exactly the
`PromptScope` a bridge needs.

### What was built

A **generic composer-insert event API in `packages/app`**, unaware of the
designer browser, which could plausibly be contributed upstream and thereby
retire the deviation entirely.

This follows an existing convention rather than inventing one. The app already
decouples components with prefixed window `CustomEvent`s, packaged as a small
module holding the event name, a typed detail, a dispatcher, and a validating
reader — see `packages/app/src/components/titlebar-session-events.ts` (35
lines, with its own unit test) and `opencode:deep-link` in
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
second adjacent one and recomputes `start`/`end` offsets, mirroring how drop
and paste already append:
`target.prompt.set([...target.prompt.current(), attachment], target.cursor)` in
`packages/app/src/components/prompt-input/attachments.ts:62`.

**No `ContextItem` chip.** `ContextItem` is a closed alias —
`export type ContextItem = FileContextItem` at
`packages/app/src/context/prompt-state.ts:64` — so a nicer "chip" UX would need
an upstream type extension. A plain text part needs none, so that is what
shipped.

**Scoping turned out not to matter for this feature.** `PromptScope` is
`{ draftID: string } | { dir: string; id?: string }`
(`packages/app/src/context/prompt-state.ts:65`), and every bridge instance
hears every event, so a scoped design would need each instance to ignore events
for other scopes. But `session.tsx` documents that session tabs on the same
server share one route instance and remount only per server, so exactly one
`PromptProvider` is mounted at a time. The element picker never sets `scope`,
so it always targets the one active provider; `scope` stays in
`ComposerInsertDetail` for generality, but a future scoped caller would need
`usePrompt` to expose per-scope readiness (today `ready` tracks the route's own
scope, not an explicitly captured one).

**Approaches evaluated and rejected:**

| Approach | Why not |
| --- | --- |
| Write the draft store directly (the `draft-get`/`draft-set` IPC already exists) | Drafts hydrate once at mount and are not watched. An external write does not update a live composer. |
| `?prompt=` URL parameter or `opencode://new-session?prompt=` deep link | Only applied when there is no session id. Useless for an ongoing session. |
| DOM injection into the composer | It is a contenteditable with rich mention pills, not a textarea. Writing text breaks pills and desynchronises the store. |
| `prompt.context.add(...)` for a nicer "chip" UX | `ContextItem` is a closed alias, so element references would need an upstream type extension. Plain text parts need none. |
| Export `usePrompt`/`PromptProvider` and mount a fork-owned hook | Workable, but `packages/app` exports only seven subpaths and none under `./context/`, and it still requires mounting something inside the provider. Same upstream cost, less generality. |

### Finding: picking requires a mounted composer

The first verification attempt read back `null` from the composer, because the
app had launched onto the session-list landing route, where no `PromptProvider`
— and therefore no `ComposerInsertBridge` — is mounted. `notifyComposerInsert`
on a route with no listener is a silent no-op; the pick still completes and the
button still disarms, but the reference goes nowhere. Clicking "New session" to
reach a route with a composer fixed it. This is a real gap, not just a test
setup quirk — see the open decisions below.

---

## Open decisions

1. **Shape and ownership of the composer-insert API**, including whether to
   propose it upstream, and multi-tab scoping semantics beyond the
   single-active-provider case this feature relies on today.
2. **Decide what happens when a pick has nowhere to land.** Today
   `notifyComposerInsert` silently no-ops if no
   `PromptProvider`/`ComposerInsertBridge` is mounted — for example on the
   session-list landing route, or a draft/session tab other than the one the
   designer is currently viewing. Options worth weighing: disable the pick
   button when there is no active composer to target, route the reference
   through a start-new-session flow instead of dropping it, or surface feedback
   (a toast) when a pick had nothing to insert into.
3. **Upgrade the reference from an inline `<picked-element/>` tag to a real
   chip/pill**, matching how v0 and Lovable actually do this. Requires
   extending `ContextItem` beyond `FileContextItem` upstream and a
   chip-rendering component — a bigger, deliberate investment, not a formatting
   tweak. Do this once the picker's usefulness is validated, not
   speculatively.
4. **Multi-select picking**, accumulating several `<picked-element/>` tags into
   one message the way Lovable's Cmd/Ctrl-click does, once single-pick is
   validated with real usage.
5. **Revisit main-world execution if the picker grows a persistent trigger**
   (for example, always-on hover outlining rather than an explicit arm/click).
   The current design's safety argument rests on the picker only ever running
   for the duration of one armed pick; a persistent variant would need the
   isolated-world/IPC tradeoff re-evaluated.
