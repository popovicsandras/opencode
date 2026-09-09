# Deviations from upstream OpenCode — index

The authoritative, maintained list of every upstream/core file this fork
touches, and why — the one document a rebase actually depends on being
complete. [intent.md](intent.md) explains why a feature exists;
[architecture.md](architecture.md) explains the technical reasoning behind
how it was built; this index (and the documents under
[deviations/](deviations/)) enumerate, literally and completely, every
upstream file either of those decisions required touching.

**This file is an index.** Every feature has its own document under
[deviations/](deviations/); this page carries only pointers and the
headlines. Keep it that way — the touched-files table, security notes, and
rebase checklist belong in the feature document, not here. Documentation
rules: [AGENTS.md](AGENTS.md).

This fork adds a designer-facing split view to the desktop app: the existing
OpenCode chat/session UI on the left, and a browser pane on the right
(currently pointed at `https://www.google.com/` as a prototype placeholder
for a future live-prototype preview). Designers can arm an element picker in
that pane and send a reference to the picked element into the chat composer,
and can hide/re-show the pane from a button in the composer.

## Start here

| Document | What it covers |
| --- | --- |
| [deviations/foundations.md](deviations/foundations.md) | Why this log exists, how the touched surface is kept small (fork-owned packages, generic event contracts, no direct upstream imports), and the rebase-checklist items that aren't specific to any one feature. **Read before touching anything.** |

## Features

| Feature | Status | Deviations | Technical | Product intent |
| --- | --- | --- | --- | --- |
| Split view | Built (prototype) | [deviations/split-view.md](deviations/split-view.md) | [architecture/split-view.md](architecture/split-view.md) | [intent/split-view.md](intent/split-view.md) |
| Preview pane | Built (prototype, placeholder destination) | [deviations/preview-pane.md](deviations/preview-pane.md) | [architecture/preview-pane.md](architecture/preview-pane.md) | [intent/preview-pane.md](intent/preview-pane.md) |
| Element picker | Built (prototype) | [deviations/element-picker.md](deviations/element-picker.md) | [architecture/element-picker.md](architecture/element-picker.md) | [intent/element-picker.md](intent/element-picker.md) |

### [Split view](deviations/split-view.md)

The minimum upstream touch for the fork-owned `designer-browser` package to
exist and be wrapped around `AppInterface` at all: a workspace dependency, a
`tsconfig` project reference, and the base `<DesignerBrowserSplit>` wrap in
the desktop renderer. No mode-specific or feature-specific logic.

### [Preview pane](deviations/preview-pane.md)

The largest touch surface: hosting the pane as an Electron `<webview>`
(default) or a `WebContentsView` (fallback), plus the chat-composer button
that hides/re-shows it via a generic `window` `CustomEvent` pair defined in
`packages/ui`. Also covers the security model for both hosting modes.

### [Element picker](deviations/element-picker.md)

Delivery half of the feature: a generic composer-insert `CustomEvent` API
added to `packages/app`, which is the only reason that package needed
touching for this feature. Capture happens entirely inside the fork-owned
package and needs no upstream touch.
