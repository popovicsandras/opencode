# Architecture — index

The technical counterpart to [intent.md](intent.md): what exists today, what we
tried and rejected, what surprised us, and what a production implementation
needs to know before touching any of it.

**This file is an index.** Every feature has its own document under
[architecture/](architecture/); this page carries only pointers and the
headlines. Keep it that way — detail belongs in the feature document, not here.
Documentation rules: [AGENTS.md](AGENTS.md).

Written during the prototype phase. The prototype validated the shape of the
experience; it did not attempt production-grade completeness. Everything in
these documents is written for whoever picks this up next.

## Start here

| Document | What it covers |
| --- | --- |
| [architecture/foundations.md](architecture/foundations.md) | The fork/rebase constraints that drove every decision, repo conventions, the fork-owned package layout, and the upstream touch points. **Read before touching anything.** |
| [architecture/verification.md](architecture/verification.md) | How to run the app, the CDP-driven verification playbook, tests and known pre-existing failures. |
| [DEVIATION-FROM-CORE.md](DEVIATION-FROM-CORE.md) | The authoritative, maintained list of upstream files we touch and why, indexed the same way as this document. The documents here explain the *reasoning* behind those deviations rather than cataloguing them. |

## Features

| Feature | Status | Technical | Product intent | Deviations |
| --- | --- | --- | --- | --- |
| Split view | Built (prototype) | [architecture/split-view.md](architecture/split-view.md) | [intent/split-view.md](intent/split-view.md) | [deviations/split-view.md](deviations/split-view.md) |
| Preview pane | Built (prototype, placeholder destination) | [architecture/preview-pane.md](architecture/preview-pane.md) | [intent/preview-pane.md](intent/preview-pane.md) | [deviations/preview-pane.md](deviations/preview-pane.md) |
| Element picker | Built (prototype) | [architecture/element-picker.md](architecture/element-picker.md) | [intent/element-picker.md](intent/element-picker.md) | [deviations/element-picker.md](deviations/element-picker.md) |

### [Split view](architecture/split-view.md)

A SolidJS shell wrapping `AppInterface` from the outside, owning the pane
width, clamping and persisting it, and resizing with the existing
`ResizeHandle` primitive. Also records the black-chat-pane layout bug and why
the `main` element's height is a good regression canary. Every upstream file
this required touching is in [deviations/split-view.md](deviations/split-view.md).

### [Preview pane](architecture/preview-pane.md)

**The most important document in the project.** The pane is an Electron
`<webview>`, not a `WebContentsView`, because a native view always composites
above all HTML and every app overlay is portaled to `document.body` — the
obvious choice is the wrong one. Also covers webview mechanics and gotchas, the
guest security model, what native mode still costs, and whether to keep it.
Visibility is now toggleable from the chat composer, via a pair of `window`
`CustomEvent`s bridging the composer and pane's separate component trees —
the same idiom the element picker already uses in the other direction. Every
upstream file this required touching, plus the security model, is in
[deviations/preview-pane.md](deviations/preview-pane.md).

### [Element picker](architecture/element-picker.md)

Two halves. Capture: serialised functions evaluated in the guest on demand, no
preload, layered source-location → identifier → CSS-path reference resolution,
emitted as a self-closing `<picked-element/>` tag. Delivery: a generic
composer-insert `CustomEvent` API added to `packages/app`, which is the only
reason that package is no longer untouched. Every upstream file this required
touching is in [deviations/element-picker.md](deviations/element-picker.md).
