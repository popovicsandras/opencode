# Intent — index

What we are building and why. **This file is an index.** Every feature has its
own document under [intent/](intent/); this page carries only the framing and a
one-paragraph pointer per feature. Keep it that way — detail belongs in the
feature document, not here.

Technical counterpart: [architecture.md](architecture.md). Documentation rules:
[AGENTS.md](AGENTS.md).

## The short version

A version of OpenCode aimed at UX and product designers rather than developers.
Same agent, same capability, but the entry point is the interface being
designed rather than the code behind it: OpenCode's chat on the left, a live
preview of the thing being designed on the right, and the ability to point at
an element in that preview and talk about it.

Why this exists, who it is for, how it should feel, and what we are
deliberately not building are in
[intent/foundations.md](intent/foundations.md). **Read that first if you are
new here.**

## Where we are

Prototype. All three features below exist and work together end to end. The
preview points at a fixed placeholder destination so we could validate the
shape of the experience before wiring it to a real prototype.

## Features

| Feature | Status | Product intent | Technical |
| --- | --- | --- | --- |
| Split view | Built (prototype) | [intent/split-view.md](intent/split-view.md) | [architecture/split-view.md](architecture/split-view.md) |
| Preview pane | Built (prototype, placeholder destination) | [intent/preview-pane.md](intent/preview-pane.md) | [architecture/preview-pane.md](architecture/preview-pane.md) |
| Element picker | Built (prototype) | [intent/element-picker.md](intent/element-picker.md) | [architecture/element-picker.md](architecture/element-picker.md) |

### [Split view](intent/split-view.md)

The two-part workspace itself. Chat and preview sit side by side permanently,
neither one a popup or a secondary window, with a divider the designer can move
and a width the app remembers.

### [Preview pane](intent/preview-pane.md)

A live, interactive view of the thing being designed — not a web browser. One
destination, steered by the agent rather than chosen by the designer, with no
address bar and nothing that invites browsing. Every app surface must paint
above it.

### [Element picker](intent/element-picker.md)

Pointing instead of describing. The designer picks an element in the preview
and a reference to it lands in the chat input as part of the message being
composed, carrying source location when the page exposes one and a stable
pointer to the element when it does not.
