# Preview pane

**Status:** built (prototype, pointed at a placeholder destination).

The right-hand side of the workspace: a live view of the thing being designed.

Technical counterpart: [architecture/preview-pane.md](../architecture/preview-pane.md).

## What it is

The preview shows one destination, decided by the product and steered by the
agent. It is not a web browser. There is no address bar, no bookmarks, no tabs,
and no way for the designer to wander off to another site. If the preview needs
to show something different, the agent is what changes it, as part of the work
being done in the conversation.

The preview is a live, interactive surface. The designer can use the thing on
screen the way a real user would: click through it, fill things in, move around
it. It behaves like the product, not like a screenshot of it.

## How it should feel

The preview has to read as part of the app, not as a window sitting on top of
it. Concretely: every app surface — menus, dialogs, settings, tooltips, toasts,
the command palette — must paint above the preview and behave normally around
it. A dialog that opens *behind* the preview breaks the illusion immediately,
and it is the single most important acceptance criterion for this feature.

Nothing in the pane should invite browsing. The absence of browser chrome is
the point, not an unfinished edge.

## Where we are

Built. The pane renders, navigates, and is fully interactive, and app overlays
paint above it correctly.

The destination is currently a fixed placeholder so we could validate the shape
of the experience before wiring it to a real prototype. Right-click menus and
in-preview browser chrome (back/forward, an inspector) remain out of scope: the
preview should keep behaving like the product being designed, not like a web
browser.

## Open questions

- How much the agent should be able to drive the preview on its own during a
  session, versus following the designer's lead.
- What the preview should actually point at, and how the destination gets
  chosen. See also the project-level question about what kinds of prototypes
  designers will bring, in [foundations.md](foundations.md).
