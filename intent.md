# Intent

This document describes what we are building and why. It captures product
intent only. Implementation, architecture, and technical decisions live
elsewhere.

## Why

OpenCode is built for developers. Its interface assumes you think in files,
diffs, and terminals, and it rewards people who already work that way. UX and
product designers do not, and today there is no comfortable way for them to
work with an AI agent on the thing they actually care about: the design and
behaviour of a product as it appears on screen.

We want a version of OpenCode aimed at designers. Same underlying agent, same
underlying capability, but an entry point that starts from the interface a
designer is designing rather than from the code behind it.

## Who it is for

UX and product designers working alongside a coding agent. They are
comfortable talking about layout, hierarchy, interaction, copy, and visual
detail. They are not expected to know where anything lives in the codebase, to
name files, or to describe a change in engineering terms.

## What it is

A two-part workspace. On the left, the OpenCode chat with the full session, as
it exists today. On the right, a live preview of the thing being designed. The
designer talks to the agent on one side and watches the result on the other,
without leaving the app or switching context.

### The split view

The two sides sit next to each other permanently. The designer can adjust how
much room each one gets, and that choice is remembered between uses. Neither
side is a popup, a modal, or a secondary window; both are always present and
always usable.

### The preview pane

The preview shows one destination, decided by the product and steered by the
agent. It is not a web browser. There is no address bar, no bookmarks, no tabs,
and no way for the designer to wander off to another site. If the preview needs
to show something different, the agent is what changes it, as part of the work
being done in the conversation.

Right now the preview points at a placeholder while we build. It will
eventually show the prototype the designer is working on.

The preview is a live, interactive surface. The designer can use the thing on
screen the way a real user would: click through it, fill things in, move around
it. It behaves like the product, not like a screenshot of it.

### Selecting elements to talk about

The hardest part of a designer working with an agent is pointing at things.
"The button" is ambiguous. "The third card in the second row" is exhausting to
type and easy to get wrong.

So the designer should be able to point directly. Pick an element in the
preview, and a reference to it goes into the chat input as part of the message
being composed. From there the conversation continues normally: "make this
bigger", "this should be a link", "why does this jump on hover". The agent
knows exactly which element is meant, because the designer pointed at it rather
than described it.

The reference should carry as much precision as is available. When the preview
can tell us where an element actually comes from, that is what should reach the
agent, because it is what lets the agent act confidently. When it cannot, a
reliable pointer to the element plus enough surrounding detail to identify it
should be sent instead. In every case, the designer should not have to think
about which of these is happening.

Selecting an element should feel like using a design tool: hovering shows what
would be picked, picking is a single deliberate action, and it is obvious what
was captured and where it went.

## How it should feel

**Like one product, not two things stapled together.** The preview is part of
the app. Menus, dialogs, settings, and every other app surface behave normally
around it and always appear above it. Nothing should look or feel like a
separate window sitting on top of the app.

**Native.** Resizing, scrolling, keyboard shortcuts, focus, and window
behaviour should match what the rest of the app does and what the operating
system leads people to expect.

**Familiar to designers.** Where there is a choice between a developer-shaped
interaction and a design-tool-shaped one, prefer the design-tool one.

**Calm.** The designer's attention belongs on their work. The tool should not
demand configuration, explain itself, or ask questions it can answer on its
own.

**A layer on top of OpenCode, not a fork of the idea.** The chat side stays the
OpenCode experience, and continues to benefit as OpenCode improves. We are
adding a way in for a different audience, not building a different product
underneath.

## Where we are

Prototype. The split view exists and the preview pane works. The preview
currently points at a fixed placeholder destination so we can validate the
shape of the experience before wiring it to a real prototype.

Element selection now works end to end: the designer arms picking, hovers to
see what would be picked, clicks to commit, and a reference to that element
appears in the chat input as part of the message being composed. The
reference favours source location when the previewed page exposes one, and
otherwise falls back to a stable pointer to the element. Right-click and
in-preview browser chrome (back/forward, an inspector) remain out of scope for
now — the preview still behaves like the product being designed, not like a
web browser.

## Not doing

- A general-purpose web browser, or anything that invites free browsing.
- Letting the designer choose the preview destination directly.
- Replacing or hiding the existing OpenCode interface for people who want it.
- Turning the designer into a developer. If a task requires understanding the
  codebase, that is the agent's job, not theirs.

## Open questions

- What kinds of prototypes designers will actually point this at, since that
  affects how precisely we can identify what they select.
- How much the agent should be able to drive the preview on its own during a
  session, versus following the designer's lead.
- What else, beyond a single element, is worth capturing and sending to the
  conversation.
- What should happen if the designer picks an element while there is no
  conversation open to receive it (for example, from a landing screen rather
  than an active session). Right now the pick still completes but the
  reference has nowhere to go, which is not the calm, obvious behaviour the
  feature is meant to have.
