# Working agreement for this folder

This prototype is built incrementally across many sessions. Each session
introduces new feature requests on top of what already exists. These rules
govern how that work gets documented. They are not optional.

(Repo-wide code conventions are in the repo-root [AGENTS.md](../AGENTS.md).
This file is about documentation only.)

## Document structure

Two governing documents, both of which are **index files only**:

- [intent.md](intent.md) — product intent: why, who, what, how it should feel.
- [architecture.md](architecture.md) — technical: what exists, what was tried
  and rejected, gotchas, open decisions.

Neither is allowed to grow into a several-thousand-line monolith. The actual
content lives in one document per feature:

```
intent.md                     index: framing + one paragraph per feature
architecture.md               index: pointers + headline per feature
intent/
  foundations.md              project-level: why, who, feel, not doing
  <feature>.md                one per feature
architecture/
  foundations.md              constraints, package layout, upstream touches
  verification.md             how to run and prove things work
  <feature>.md                one per feature
```

Rules for the structure:

- **Same slug on both sides.** A feature named `element-picker` has exactly
  `intent/element-picker.md` and `architecture/element-picker.md`. Kebab-case.
- **Every feature appears in both indexes**, in the feature table and as a
  short entry. The tables cross-link to each other's counterpart, so an agent
  landing on either index can reach everything.
- **Indexes carry framing and pointers, never detail.** If you are adding more
  than a short paragraph to an index, it belongs in a feature document.
- **Feature documents are self-contained enough to work from.** Someone picking
  up one feature should be able to read foundations plus that one document and
  start. Link across to other features rather than duplicating them.
- **Cross-cutting material goes in `foundations.md` or `verification.md`**, not
  smeared across feature documents.
- Each feature document opens with a **status** line and a link to its
  counterpart, and ends with its own **open questions / open decisions**.
  Project-level questions belong in `foundations.md` instead.

## When documents get updated

Two triggers, both mandatory:

**1. When a feature is agreed and planned.** Create
`intent/<feature>.md` and `architecture/<feature>.md`, and add the feature to
both index tables with a status of `Planned`. Record the intent and the plan,
including the alternatives already ruled out during the discussion.

**2. When that feature is implemented.** Update both documents to reflect what
was actually built — status, what exists, gotchas discovered, decisions closed,
new open questions raised. **This happens in the same session as the
implementation.** It is not deferrable to "later".

Further guidance:

- `intent.md` / `intent/` changes when the feature changes what the product
  does, who it is for, or how it should feel.
- `architecture.md` / `architecture/` changes when the feature changes what
  exists, adds a technical decision, closes or raises an open question, or
  produces a finding worth recording for whoever picks this up next.
- Record what was **rejected** and why, not just what was built. The rejected
  alternatives are the most valuable part of these documents on a re-read.
- A change can require updates to both sides, one, or (rarely) neither — if
  truly neither applies, say so explicitly rather than silently skipping it.
- Do not wait to be asked. Treat "we agreed on it" and "it is implemented" as
  the triggers, not a reminder.

Keep the documents honest: agreed-but-not-yet-implemented is not done, and
implemented-but-undocumented is not done either.
