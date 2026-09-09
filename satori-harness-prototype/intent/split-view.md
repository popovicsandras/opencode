# Split view

**Status:** built (prototype).

The two-part workspace itself: the OpenCode chat on the left, the preview on
the right, permanently side by side.

Technical counterpart: [architecture/split-view.md](../architecture/split-view.md).

## What it is

The two sides sit next to each other permanently. The designer can adjust how
much room each one gets, and that choice is remembered between uses. Neither
side is a popup, a modal, or a secondary window; both are always present and
always usable.

The chat side is unchanged OpenCode. Nothing about the existing session
experience is replaced, hidden, or reinterpreted — the split adds a second
surface next to it rather than rebuilding the first one.

## How it should feel

Adjusting the divider should feel like adjusting a pane in any native
application: direct, continuous, and with no sense that one side is a guest in
the other's window. The width the designer settles on is theirs; the app should
not second-guess it or reset it between sessions.

## Where we are

Built. The split renders, the divider drags, the width is clamped to something
sensible at both extremes, and the choice persists between launches.

## Open questions

None outstanding. The remaining uncertainty in this area sits with the preview
pane rather than with the split itself.
