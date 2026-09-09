# Foundations

Project-level product framing: why this exists, who it is for, how it should
feel, and what we are deliberately not building. Individual features have their
own documents, listed in [intent.md](../intent.md).

Technical counterpart: [architecture/foundations.md](../architecture/foundations.md).

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

## Not doing

- A general-purpose web browser, or anything that invites free browsing.
- Letting the designer choose the preview destination directly.
- Replacing or hiding the existing OpenCode interface for people who want it.
- Turning the designer into a developer. If a task requires understanding the
  codebase, that is the agent's job, not theirs.

## Open questions

Project-level only. Feature-specific questions live in the feature documents.

- What kinds of prototypes designers will actually point this at. This shapes
  both what the preview can show and how precisely we can identify what the
  designer selects, so it constrains more than one feature at once.
